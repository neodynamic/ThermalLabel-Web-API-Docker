# ThermalLabel Web API for Docker

>On-premise REST API to generate advanced barcode labels supporting data merging, expressions/formulas, and conversion to printer commands and known file formats from Docker

**[ThermalLabel Web API for Docker](https://www.neodynamic.com/products/printing/thermal-label/docker/)** can be used for designing from simple to complex labels layout supporting **Texts, Barcodes, Graphics** and **Images**, **RFID Tags**, and **Shapes** like **circles, ellipses, rectangles,** and **lines** and **export/convert it to either raw Zebra, EPSON &amp; Honeywell-Intermec printer commands** as well as to image or document formats like **JPEG/JPG, PNG, PCX, SVG, HTML, and PDF** from **Any Development Platform and Programming Languages (.NET, Java, PHP, Javascript, Python, Ruby, and more!)**

**ThermalLabel Web Editor Add-on** is a _first-class barcode label designer component for any website_ which empowers your WebApps by providing an end-user visual label editor!
With the **ThermalLabel Web Editor** component, you can allow your end-users to **create, load, edit and save ThermalLabel objects** in the form of **XML/JSON template files** definition from **Windows, Linux, Mac &amp; Android Clients with latest browsers!**

## About this repo

This repo contains the source code that shows how you can integrate the **ThermalLabel Web Editor** component that is fully customizable to match your own styles and look and feel.

After you download and install the **[ThermalLabel Web API for Docker](https://www.neodynamic.com/products/printing/thermal-label/docker/#download)** image, you must **modify the following line in the Scripts/SampleLabelEditorUI.js file** to the URL where the Docker image is available.

> Neodynamic.Web.Editor.ThermalLabelEditor.websiteRootAbsoluteUrl = "http://localhost:8080";

Comments about some script files in this project:

- **ThermalLabelWebEditor.js** is the label editor component that provides a canvas for placing texts, barcodes, shapes, images, etc to design a label. 
- **SampleLabelEditorUI.js** is the sample UI (you can fully customize) around the label editor component and shows you how to integrate the **ThermalLabelEditor.js** 
- **JSPrintManager.js** is other of our products called [JSPrintManager](https://www.neodynamic.com/products/printing/js-print-manager) that allows printing content from any website to any client printer. We use it here to provide printing functionality to the label editor.

## Licensing

**ThermalLabel Web API for Docker (and the Editor Add-on) is a Commercial** product. Licensing model and prices are available [here](https://neodynamic.com/products/printing/thermal-label/docker/buy)

## Support

Tech questions are handled by [Neodynamic Dev Team](https://neodynamic/support)
