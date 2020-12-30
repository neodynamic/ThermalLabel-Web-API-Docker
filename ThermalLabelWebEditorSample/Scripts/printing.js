// Client side Printing is performed by JSPrintManager solution
// https://www.neodynamic.com/products/printing/js-print-manager

$("#imgInstPrintersWait").attr("src", gallery.getProgressIcon());
$("#imgSerPortsWait").attr("src", gallery.getProgressIcon());

$("#jspmInfo").hide();
$("#btnStartPrint").hide();

$("#instPrinters").hide();
$("#serPorts").hide();

var _installedPrinters = {
    _value: '',
    get val() {
        return this._value;
    },
    set val(value) {
        this._value = value;
        $("#instPrintersWait").hide();
        $("#instPrinters").show();
    }
}

var _rs323Ports = {
    _value: '',
    get val() {
        return this._value;
    },
    set val(value) {
        this._value = value;
        $("#serPortsWait").hide();
        $("#serPorts").show();
    }
}


//WebSocket settings
JSPM.JSPrintManager.auto_reconnect = true;
JSPM.JSPrintManager.start();
JSPM.JSPrintManager.WS.onStatusChanged = function () {
    if (jspmWSStatus()) {
        //get client installed printers
        JSPM.JSPrintManager.getPrinters().then(function (myPrinters) {
            var options = '';
            for (var i = 0; i < myPrinters.length; i++) {
                options += '<option>' + myPrinters[i] + '</option>';
            }
            $('#instPrinterName').html(options);

            _installedPrinters.val = myPrinters;
        });
        //get serial ports if any
        JSPM.JSPrintManager.getSerialPorts().then(function (portsList) {
            var options = '';
            for (var i = 0; i < portsList.length; i++) {
                options += '<option>' + portsList[i] + '</option>';
            }
            $('#serPrinterPort').html(options);

            _rs323Ports.val = portsList;
        });
    }
};

//Check JSPM WebSocket status
function jspmWSStatus() {
    $("#printSettings").hide();
    

    if (JSPM.JSPrintManager.websocket_status == JSPM.WSStatus.Open) {
        $("#printSettings").show();
        $("#btnStartPrint").show();
        return true;
    }
    else if (JSPM.JSPrintManager.websocket_status == JSPM.WSStatus.Closed) {
        $("#jspmInfo").show();
        console.log('JSPrintManager (JSPM) is not installed or not running! Download JSPM Client App from https://neodynamic.com/downloads/jspm');
        return false;
    }
    else if (JSPM.JSPrintManager.websocket_status == JSPM.WSStatus.Blocked) {
        $("#jspmInfo").show();
        console.log('JSPM has blocked this website!');
        return false;
    }
}

// Printing process
function jspmPrint() {
    if (tleditor.get_thermal_label) {
        tleditor.getJsonTemplate(null, function (data) {
            // data is the JSON label template to be printed
            //console.log(data);
            var jsonThermalLabel = data;

            // get the data source for this label if any
            // it's fixed for simplicity but can be customized to fit your needs
            // you could set json or xml as data sources
            var dataSource = null;
            if ($('#chkUseDataSourceSample').prop('checked')) {
                dataSource = $('#txtDataSource').val();
            }

            // CONVERT the label template to raw printer commands OR image/graphic
            var webAPI = Neodynamic.Web.Editor.ThermalLabelEditor.websiteRootAbsoluteUrl + "/ThermalLabel/Convert";

            // convertData obj to pass to the ThermalLabel Web API
            var convertData = {
                "thermalLabel": "",
                "dataSource": "",
                "dpi": 96,
                "pageOrientation": "Portrait",
                "copies": 1,
                "replicates": 0,
                "pdfMetadata": {
                    "author": "string",
                    "creator": "string",
                    "producer": "string",
                    "subject": "string",
                    "title": "string",
                    "useVectorDrawing": false
                }
            };

            // determine if raw commands or graphic conversion is requested
            var acceptHeader;
            var dpi = 300;
            var selPrinterType = $("#selPrinterType .active").text();
            if (selPrinterType == "Local") {
                if ($("input[name='printOutputs']:checked").val() == "raw") {
                    acceptHeader = "application/vnd." + $("#instPrinterLang").children("option:selected").val();
                    dpi = parseInt($("#instPrinterDpi").children("option:selected").val());
                } else {
                    acceptHeader = "application/pdf";
                }
            } else {
                var prefix = (selPrinterType == "Network" ? "net" : (selPrinterType == "Parallel" ? "par" : "ser"));
                var tmp = "#" + prefix + "PrinterLang";
                acceptHeader = "application/vnd." + $(tmp).children("option:selected").val();
                tmp = "#" + prefix + "PrinterDpi";
                dpi = parseInt($(tmp).children("option:selected").val());
            }

            // set convertData
            convertData.thermalLabel = JSON.stringify(jsonThermalLabel);
            if (dataSource) convertData.dataSource = dataSource;
            convertData.copies = parseInt($("#printCopies").val());
            convertData.pageOrientation = $("#printOrientation").children("option:selected").val();
            convertData.dpi = dpi;

            // now call the API for conversion process
            var self = this;
            self.selPrinterType = selPrinterType;
            self.acceptHeader = acceptHeader;

            var xhr = new XMLHttpRequest();
            xhr.open("POST", webAPI, true);
            xhr.setRequestHeader("Accept", acceptHeader);
            xhr.responseType = "arraybuffer";

            xhr.onload = function (e) {
                if (xhr.status != 200) {
                    alert("Error " + xhr.status + ": " + xhr.statusText);
                } else {

                    // Do print...
                    //Create a ClientPrintJob
                    var cpj = new JSPM.ClientPrintJob();

                    // Set printer type
                    if (self.selPrinterType == "Local") {

                        cpj.clientPrinter = new JSPM.InstalledPrinter($('#instPrinterName').val());

                    } else if (self.selPrinterType == "Network") {

                        cpj.clientPrinter = new JSPM.NetworkPrinter(parseInt($('#netPrinterPort').val()), $('#netPrinterIP').val(), null);

                    } else if (self.selPrinterType == "Parallel") {

                        cpj.clientPrinter = new JSPM.ParallelPortPrinter($('#parPrinterPort').val());

                    } else {

                        cpj.clientPrinter = new JSPM.SerialPortPrinter($('#serPrinterPort').val(), parseInt($('#serPrinterBaudRate').val()), JSPM.Serial.Parity[$('#serPrinterParity').val()], JSPM.Serial.StopBits[$('#serPrinterStopBits').val()], JSPM.Serial.DataBits[$('#serPrinterDataBits').val()], JSPM.Serial.Handshake[$('#serPrinterFlowControl').val()]);

                    }

                    // set file or raw commands?
                    if (self.acceptHeader == "application/pdf") {
                        // set pdf file
                        var my_file = new JSPM.PrintFilePDF(xhr.response, JSPM.FileSourceType.BLOB, 'MyLabel.pdf', 1);
                        //my_file.pageSizing = JSPM.Sizing.Fit;

                        cpj.files.push(my_file);

                    } else {
                        //Set printer commands...
                        cpj.binaryPrinterCommands = new Uint8Array(xhr.response);
                    }

                    //Send print job to printer!
                    cpj.sendToClient();
                }
            }

            xhr.setRequestHeader("Content-Type", "application/json");
            xhr.send(JSON.stringify(convertData));

            
        });
    }
}