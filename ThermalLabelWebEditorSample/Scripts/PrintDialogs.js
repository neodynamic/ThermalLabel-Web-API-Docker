// =====================================================================
// PrintDialogs.js
// Print method chooser + advanced client printing via JSPrintManager,
// converting the label with the ThermalLabel Web API (POST /ThermalLabel/Convert)
//
//  - #print-dialog       : lets the user pick the printing method
//      * Standard  -> UIEditor.doPrinting()  (TLClientPrint, Windows only)
//      * Advanced  -> #jspm-print-dialog      (JSPrintManager, any OS)
//  - #jspm-print-dialog  : JSPM printer settings + print job
//
// Conversion flow (Advanced):
//   tleditor.getJsonTemplate()  ->  POST {apiBaseUrl}/ThermalLabel/Convert
//      Accept: application/vnd.zpl | vnd.epl | vnd.fingerprint | vnd.escpos  -> raw bytes
//      Accept: application/pdf                                               -> PDF file
//   -> JSPM.ClientPrintJob -> client printer
//
// Optional configuration (define BEFORE loading this script):
//   window.PrintDialogsConfig = {
//       apiBaseUrl: 'https://my-tl-api:8080',   // default: ThermalLabelEditor.websiteRootAbsoluteUrl or page origin
//       apiHeaders: { 'X-Api-Key': '...' },     // extra request headers, if your API needs them
//       timeoutMs: 60000,
//       pdfDpi: 300,
//       pdfUseVectorDrawing: false
//   };
//
// Requires (load order): jquery, bootstrap, ThermalLabelWebEditor,
// TemplatesGallery (progress icon), SampleLabelEditorUI (UIEditor/tleditor),
// JSPrintManager.js, then this file.
// =====================================================================

var PrintDialogs = (function () {

    var STORAGE_KEY = 'tlwe.printMethod';
    var CONVERT_PATH = '/ThermalLabel/Convert';

    var cfg = $.extend({
        apiBaseUrl: null,
        apiHeaders: {},
        timeoutMs: 60000,
        pdfDpi: 300,
        pdfUseVectorDrawing: false
    }, window.PrintDialogsConfig || {});

    // Printer language <select> values -> Accept header of /ThermalLabel/Convert
    var LANG_ACCEPT = {
        zpl: 'application/vnd.zpl',
        epl: 'application/vnd.epl',
        fingerprint: 'application/vnd.fingerprint',
        dp: 'application/vnd.dp',
        escpos: 'application/vnd.escpos'
    };

    // Active tab (href) -> settings prefix used by the dialog ids
    var TAB_PREFIX = {
        '#tabInstalledPrinter': 'inst',
        '#tabNetworkPrinter': 'net',
        '#tabSerialPrinter': 'ser',
        '#tabParallelPrinter': 'par'
    };

    var jspmStarted = false;
    var busy = false;

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function isWindows() {
        return /(windows|win32|win64)/i.test(navigator.userAgent);
    }

    function jspmAvailable() {
        return typeof window.JSPM !== 'undefined' && JSPM.JSPrintManager;
    }

    function readSavedMethod() {
        try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
    }

    function saveMethod(m) {
        try { localStorage.setItem(STORAGE_KEY, m); } catch (e) { /* storage unavailable */ }
    }

    function apiConvertUrl() {
        var base = cfg.apiBaseUrl
            || (window.Neodynamic && Neodynamic.Web.Editor.ThermalLabelEditor.websiteRootAbsoluteUrl)
            || window.location.origin;
        return String(base).replace(/\/+$/, '') + CONVERT_PATH;
    }

    function fillSelect($select, values) {
        $select.empty();
        $.each(values || [], function (_, v) {
            $select.append($('<option>').val(v).text(v)); // .text() = no HTML injection from printer names
        });
    }

    function showJspmError(msg) {
        $('#jspmError').text(msg).show();
    }

    function setBusy(on) {
        busy = on;
        $('#btnStartPrint').prop('disabled', on)
            .find('.fa').toggleClass('fa-print', !on).toggleClass('fa-spinner fa-spin', on);
    }

    // ------------------------------------------------------------------
    // ThermalLabel Web API
    // ------------------------------------------------------------------

    // Current label as JSON template (string), through the editor's own handler
    function getLabelJson() {
        return new Promise(function (resolve, reject) {
            if (!tleditor.get_thermal_label) { reject(new Error('There is no label to print.')); return; }
            // On handler failure tleditor.onError shows #error-dialog and this callback never runs;
            // the #error-dialog hook in init() releases the busy state.
            tleditor.getJsonTemplate(null, function (data) {
                if (!data) { reject(new Error('The label template could not be generated.')); return; }
                resolve(typeof data === 'string' ? data : JSON.stringify(data));
            });
        });
    }

    // Extracts a readable message from a ProblemDetails (or plain text) error body
    function readApiError(status, statusText, buffer) {
        var msg = '';
        try {
            var text = new TextDecoder('utf-8').decode(buffer);
            try {
                var pd = JSON.parse(text);
                msg = pd.detail || pd.title || text;
            } catch (e) { msg = text; }
        } catch (e) { /* binary or empty body */ }
        msg = $.trim(String(msg || '')).substring(0, 500);
        return 'ThermalLabel API error ' + status + (statusText ? ' (' + statusText + ')' : '') + (msg ? ': ' + msg : '');
    }

    // POST /ThermalLabel/Convert -> ArrayBuffer with the requested output
    function convertLabel(convertData, accept) {
        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = controller ? setTimeout(function () { controller.abort(); }, cfg.timeoutMs) : null;

        var headers = $.extend({ 'Content-Type': 'application/json', 'Accept': accept }, cfg.apiHeaders);

        return fetch(apiConvertUrl(), {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(convertData),
            signal: controller ? controller.signal : undefined
        }).then(function (resp) {
            return resp.arrayBuffer().then(function (buf) {
                if (!resp.ok) throw new Error(readApiError(resp.status, resp.statusText, buf));
                if (!buf || buf.byteLength === 0) throw new Error('The ThermalLabel API returned an empty output.');
                return buf;
            });
        }, function (err) {
            if (err && err.name === 'AbortError') throw new Error('The ThermalLabel API did not respond in time.');
            // Network failure, wrong URL or CORS not enabled on the API
            throw new Error('Cannot reach the ThermalLabel API at ' + apiConvertUrl() + '. Check the URL and CORS settings.');
        }).finally(function () {
            if (timer) clearTimeout(timer);
        });
    }

    // ------------------------------------------------------------------
    // Step 1: method chooser (#print-dialog)
    // ------------------------------------------------------------------

    function selectMethod(method) {
        $('#print-method-options .print-option').each(function () {
            var on = $(this).data('method') === method;
            $(this).toggleClass('active', on).attr('aria-checked', on ? 'true' : 'false');
        });
        $('#btnPrintMethodContinue').prop('disabled', !method);
    }

    function selectedMethod() {
        return $('#print-method-options .print-option.active').data('method') || null;
    }

    function open() {
        if (!tleditor.get_thermal_label) {
            UIEditor.showErrorMsg('There is no label to print. Create or open a label first.');
            return;
        }

        var win = isWindows();
        var $std = $('#print-method-options .print-option[data-method="standard"]');
        $std.prop('disabled', !win).toggleClass('disabled', !win);
        $('#printStdNotSupported').toggle(!win);

        var method = readSavedMethod();
        if (!win || (method !== 'standard' && method !== 'jspm')) method = win ? 'standard' : 'jspm';
        selectMethod(method);

        $('#print-dialog').modal('show');
    }

    function continueWithMethod() {
        var method = selectedMethod();
        if (!method) return;
        saveMethod(method);

        if (method === 'standard') {
            $('#print-dialog').modal('hide');
            UIEditor.doPrinting();
            return;
        }

        // Advanced: open the JSPM dialog once the chooser is fully hidden
        // (Bootstrap 3 does not support stacked modals well)
        $('#print-dialog').one('hidden.bs.modal', function () {
            openJspmDialog();
        }).modal('hide');
    }

    // ------------------------------------------------------------------
    // Step 2: JSPrintManager dialog (#jspm-print-dialog)
    // ------------------------------------------------------------------

    function openJspmDialog() {
        $('#jspmError').hide();
        setBusy(false);

        if (!jspmAvailable()) {
            $('#jspmConnecting, #printSettings').hide();
            $('#btnStartPrint').hide();
            $('#jspmInfo').show();
            $('#jspmInfoReason').text('JSPrintManager.js script is not loaded in this page.');
            $('#jspm-print-dialog').modal('show');
            return;
        }

        $('#jspm-print-dialog').modal('show');

        if (!jspmStarted) {
            startJspm();
        } else {
            updateJspmStatus();
        }
    }

    function startJspm() {
        jspmStarted = true;
        $('#printSettings, #jspmInfo').hide();
        $('#btnStartPrint').hide();
        $('#jspmConnecting').show();

        JSPM.JSPrintManager.auto_reconnect = true;
        JSPM.JSPrintManager.start();
        JSPM.JSPrintManager.WS.onStatusChanged = function () {
            if (updateJspmStatus()) loadClientDevices();
        };
    }

    // Returns true when the WebSocket is open and ready
    function updateJspmStatus() {
        var st = JSPM.JSPrintManager.websocket_status;
        $('#jspmConnecting').hide();

        if (st === JSPM.WSStatus.Open) {
            $('#jspmInfo').hide();
            $('#printSettings').show();
            $('#btnStartPrint').show();
            return true;
        }

        $('#printSettings').hide();
        $('#btnStartPrint').hide();

        if (st === JSPM.WSStatus.WaitingForUserResponse) {
            $('#jspmConnecting').show().find('em').text('Waiting for your permission in the JSPrintManager app...');
            return false;
        }

        $('#jspmInfo').show();
        $('#jspmInfoReason').text(st === JSPM.WSStatus.Blocked
            ? 'JSPrintManager has blocked this website. Allow it from the JSPrintManager app settings.'
            : 'JSPrintManager Client App is not installed or not running on this machine.');
        return false;
    }

    function loadClientDevices() {
        $('#instPrintersWait, #serPortsWait').show();
        $('#instPrinters, #serPorts').hide();

        JSPM.JSPrintManager.getPrinters().then(function (printers) {
            fillSelect($('#instPrinterName'), printers);
            $('#instPrintersWait').hide();
            $('#instPrinters').show();
        });

        JSPM.JSPrintManager.getSerialPorts().then(function (ports) {
            fillSelect($('#serPrinterPort'), ports);
            $('#serPortsWait').hide();
            $('#serPorts').show();
        }).catch(function () {
            $('#serPortsWait').hide();
            $('#serPorts').show();
        });
    }

    // Collects and validates the settings; returns null (and shows an error) when invalid
    function readSettings() {
        var tab = $('#selPrinterType li.active a').attr('href');
        var prefix = TAB_PREFIX[tab] || 'inst';

        var copies = parseInt($('#printCopies').val(), 10);
        if (!(copies >= 1 && copies <= 100)) {
            showJspmError('Copies must be a number between 1 and 100.');
            return null;
        }

        var asGraphic = prefix === 'inst' && $("input[name='printOutputs']:checked").val() === 'graphic';

        var s = {
            prefix: prefix,
            copies: copies,
            orientation: $('#printOrientation').val() || 'Portrait',
            asGraphic: asGraphic,
            accept: asGraphic ? 'application/pdf' : (LANG_ACCEPT[$('#' + prefix + 'PrinterLang').val()] || LANG_ACCEPT.zpl),
            dpi: asGraphic ? cfg.pdfDpi : (parseInt($('#' + prefix + 'PrinterDpi').val(), 10) || 203)
        };

        if (prefix === 'inst' && !$('#instPrinterName').val()) {
            showJspmError('Select a printer.'); return null;
        }
        if (prefix === 'net' && (!$.trim($('#netPrinterIP').val()) || !(parseInt($('#netPrinterPort').val(), 10) > 0))) {
            showJspmError('Enter the printer IP address and port.'); return null;
        }
        if (prefix === 'ser' && !$('#serPrinterPort').val()) {
            showJspmError('No serial port available.'); return null;
        }
        if (prefix === 'par' && !$.trim($('#parPrinterPort').val())) {
            showJspmError('Enter the parallel port name.'); return null;
        }
        return s;
    }

    // ConvertData body for POST /ThermalLabel/Convert (see swagger: ConvertData)
    function buildConvertData(s, labelJson) {
        var ds = UIEditor.getDataSource();
        var data = {
            thermalLabel: labelJson,
            dataSource: ds.dataSource || '',
            dpi: s.dpi,
            pageOrientation: s.orientation,
            // Raw: copies are embedded in the printer commands.
            // PDF: one copy is rendered and JSPM prints it s.copies times (avoids duplicated copies).
            copies: s.asGraphic ? 1 : s.copies,
            replicates: 0
        };
        if (s.asGraphic) {
            data.pdfMetadata = {
                author: '', creator: 'ThermalLabel Web Editor', producer: '', subject: '', title: 'Label',
                useVectorDrawing: !!cfg.pdfUseVectorDrawing
            };
        }
        return data;
    }

    function buildClientPrinter(prefix) {
        switch (prefix) {
            case 'net':
                return new JSPM.NetworkPrinter(parseInt($('#netPrinterPort').val(), 10), $.trim($('#netPrinterIP').val()), null);
            case 'par':
                return new JSPM.ParallelPortPrinter($.trim($('#parPrinterPort').val()));
            case 'ser':
                return new JSPM.SerialPortPrinter(
                    $('#serPrinterPort').val(),
                    parseInt($('#serPrinterBaudRate').val(), 10) || 9600,
                    JSPM.Serial.Parity[$('#serPrinterParity').val()],
                    JSPM.Serial.StopBits[$('#serPrinterStopBits').val()],
                    JSPM.Serial.DataBits[$('#serPrinterDataBits').val()],
                    JSPM.Serial.Handshake[$('#serPrinterFlowControl').val()]);
            default:
                return new JSPM.InstalledPrinter($('#instPrinterName').val());
        }
    }

    function sendJob(s, buffer) {
        var cpj = new JSPM.ClientPrintJob();
        cpj.clientPrinter = buildClientPrinter(s.prefix);

        if (s.asGraphic) {
            var pdfBlob = new Blob([buffer], { type: 'application/pdf' });
            cpj.files.push(new JSPM.PrintFilePDF(pdfBlob, JSPM.FileSourceType.BLOB, 'label.pdf', s.copies));
        } else {
            cpj.binaryPrinterCommands = new Uint8Array(buffer);
        }

        cpj.sendToClient();
    }

    function print() {
        if (busy || !tleditor.get_thermal_label) return;
        $('#jspmError').hide();

        var s = readSettings();
        if (!s) return;

        setBusy(true);

        getLabelJson()
            .then(function (labelJson) {
                return convertLabel(buildConvertData(s, labelJson), s.accept);
            })
            .then(function (buffer) {
                sendJob(s, buffer);
                setBusy(false);
                $('#jspm-print-dialog').modal('hide');
            })
            .catch(function (err) {
                setBusy(false);
                showJspmError(err && err.message ? err.message : String(err));
            });
    }

    // ------------------------------------------------------------------
    // Wiring
    // ------------------------------------------------------------------

    function init() {
        var icon = (window.gallery && gallery.getProgressIcon) ? gallery.getProgressIcon() : '';
        $('#imgInstPrintersWait, #imgSerPortsWait, #imgJspmConnecting').attr('src', icon);

        $('#print-method-options').on('click', '.print-option:not(.disabled)', function () {
            selectMethod($(this).data('method'));
        });
        $('#print-method-options').on('dblclick', '.print-option:not(.disabled)', function () {
            selectMethod($(this).data('method'));
            continueWithMethod();
        });
        $('#btnPrintMethodContinue').on('click', continueWithMethod);

        $('#btnStartPrint').on('click', print);
        // getJsonTemplate failures are reported by tleditor.onError (#error-dialog) and its
        // callback never runs, so release the Print button when that happens
        $('#error-dialog').on('show.bs.modal', function () { if (busy) setBusy(false); });

        $('#btnJspmBack').on('click', function () {
            $('#jspm-print-dialog').one('hidden.bs.modal', open).modal('hide');
        });
        $('#btnJspmRetry').on('click', function () {
            if (!jspmAvailable()) return;
            $('#jspmInfo').hide();
            $('#jspmConnecting').show().find('em').text('Connecting to JSPrintManager...');
            JSPM.JSPrintManager.start();
            JSPM.JSPrintManager.WS.onStatusChanged = function () {
                if (updateJspmStatus()) loadClientDevices();
            };
        });

        // "Print as graphic" ignores language/DPI
        $("input[name='printOutputs']").on('change', function () {
            var graphic = $("input[name='printOutputs']:checked").val() === 'graphic';
            $('#instPrinterLang, #instPrinterDpi').prop('disabled', graphic);
        });
    }

    $(init);

    return { open: open, openAdvanced: openJspmDialog, config: cfg };
})();