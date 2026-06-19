/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Shipment } from "../types";
import { getFlightWithDateSuffix, formatAwb } from "../utils/helpers";

interface JobSheetModalProps {
  row: Shipment;
  onClose: () => void;
}

export const JobSheetModal: React.FC<JobSheetModalProps> = ({ row, onClose }) => {
  // Local editable state for the JOB COVER SHEET, initialized as force uppercase
  const [js, setJs] = useState(() => ({
    shipper: (row.shipper || "").toUpperCase(),
    firstFlight: (getFlightWithDateSuffix(row.flight || "", row.date || "")).toUpperCase(),
    secondFlight: (row.secondFlight || "").toUpperCase(),
    awb: (row.awb || "").toUpperCase(),
    unit: (row.uld || "").toUpperCase(), // Prefilled with equipment used in uppercase
    dest: (row.dest || "").toUpperCase(),
    consolRef: (row.consolRef || "").toUpperCase(),
    jobRef: (row.jobRef || "").toUpperCase(),
    specialInst: (row.specialInst || "").toUpperCase()
  }));

  const handlePrint = () => {
    const win = window.open("", "_blank", "width=1050,height=850");
    if (!win) return;
    
    const html = `<!DOCTYPE html><html><head><title>Job Cover Sheet - ${js.shipper}</title><style>
    *{box-sizing:border-box;margin:0;padding:0;text-transform:uppercase;-webkit-print-color-adjust: exact !important;print-color-adjust: exact !important;}
    body{font-family:Arial,sans-serif;color:#000;padding:20px;background:#fff;text-transform:uppercase;}
    .title-box{text-align:center;font-size:20px;font-weight:900;border:4px solid #000;padding:10px;margin-bottom:12px;letter-spacing:3px;text-transform:uppercase;background:#fff !important;color:#000 !important;}
    .grid-box{border:4px solid #000000;overflow:hidden;background:#fff !important;}
    
    .row-split-3{display:grid;grid-template-columns: 6fr 3fr 3fr;border-bottom:4px solid #000000;min-height:85px;}
    .row-split-awb-unit-dest{display:grid;grid-template-columns: 5fr 5fr 2fr;border-bottom:4px solid #000000;min-height:85px;}
    .row-split-2{display:grid;grid-template-columns: 1fr 1fr;border-bottom:4px solid #000000;min-height:75px;}
    .cell-stack{display:flex;flex-direction:column;}
    
    .label-block{background:#000000 !important;color:#ffffff !important;font-weight:bold;font-size:13px;padding:6px 10px;border-bottom:2px solid #000;text-transform:uppercase;font-family:monospace;letter-spacing:1px;-webkit-print-color-adjust: exact !important;print-color-adjust: exact !important;}
    .value-block{flex:1;padding:8px;font-size:14px;font-weight:900;text-transform:uppercase;color:#000 !important;white-space:pre-wrap;background:#fff !important;}
    .cell{display:flex;flex-direction:column;}
    .cell-br{border-right:4px solid #000000;}
    .inst-row{display:flex;flex-direction:column;min-height:140px;}
    @media print{
      @page {
        size: A4 portrait;
        margin: 10mm 12mm;
      }
      body{padding:0px;margin:0px;}
      .title-box{border-width:4px;}
      .grid-box{border-width:4px;}
    }
    </style></head>
    <body>
      <div class="title-box">SEAWAY</div>
      <div class="grid-box">
        
         <!-- Row 1: Shipper, 1st Flight, 2nd Flight -->
        <div class="row-split-3">
          <div class="cell cell-br">
            <div class="label-block">SHIPPER</div>
            <div class="value-block">${js.shipper}</div>
          </div>
          <div class="cell cell-br">
            <div class="label-block">1ST FLIGHT / DATE</div>
            <div class="value-block">${js.firstFlight}</div>
          </div>
          <div class="cell">
            <div class="label-block">2ND FLIGHT</div>
            <div class="value-block">${js.secondFlight}</div>
          </div>
        </div>
 
        <!-- Row 2: AWB, Unit/ULD/Equipment, DEST -->
        <div class="row-split-awb-unit-dest">
          <div class="cell cell-br">
            <div class="label-block">AWB</div>
            <div class="value-block">${js.awb}</div>
          </div>
          <div class="cell cell-br">
            <div class="label-block">UNIT / ULD (EQUIPMENT USED)</div>
            <div class="value-block">${js.unit}</div>
          </div>
          <div class="cell">
            <div class="label-block">DEST</div>
            <div class="value-block">${js.dest}</div>
          </div>
        </div>
 
        <!-- Row 3: Consol Ref & Job Ref -->
        <div class="row-split-2">
          <div class="cell cell-br">
            <div class="label-block">CONSOL REF</div>
            <div class="value-block">${js.consolRef}</div>
          </div>
          <div class="cell">
            <div class="label-block">JOB REF</div>
            <div class="value-block">${js.jobRef}</div>
          </div>
        </div>
 
        <!-- Special instructions block -->
        <div class="inst-row">
          <div class="label-block">SPECIAL INSTRUCTIONS</div>
          <div class="value-block" style="font-size:13px; line-height:1.5;">${js.specialInst}</div>
        </div>
 
      </div>
    </body></html>`;
 
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 450);
  };
 
  const handleFieldChange = (key: keyof typeof js) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    let value = e.target.value.toUpperCase();
    if (key === "awb") {
      value = formatAwb(value, js.awb);
    }
    setJs((prev) => ({ ...prev, [key]: value }));
  };
 
  const labelStyle: React.CSSProperties = {
    background: "#000000",
    color: "#ffffff",
    fontWeight: 700,
    fontSize: 13,
    padding: "6px 12px",
    borderBottom: "2px solid #000000",
    textTransform: "uppercase",
    fontFamily: "monospace",
    letterSpacing: "1px"
  };
 
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)", backdropFilter: "blur(6px)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "30px 20px" }}>
      <div style={{ background: "#ffffff", borderRadius: 16, width: 850, maxWidth: "100%", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", overflow: "hidden", border: "1px solid #e2e8f0" }}>
        
        {/* Modal Header */}
        <div style={{ background: "#1e293b", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ color: "#ffffff", fontWeight: 700, fontSize: 16, display: "block" }}>📋 SEAWAY</span>
            <span style={{ color: "#94a3b8", fontSize: 12, fontWeight: 500 }}>AWB: {row.awb} · Flight: {row.flight} · Shipper: {row.shipper}</span>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button id="job-sheet-print-btn" onClick={handlePrint} style={{ background: "#d97706", border: "none", color: "#fff", borderRadius: 24, padding: "8px 20px", cursor: "pointer", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              🖨 Print Cover Sheet
            </button>
            <button id="job-sheet-close-btn" onClick={onClose} style={{ background: "#475569", border: "none", color: "#ffffff", borderRadius: 24, padding: "8px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              ✕ Close
            </button>
          </div>
        </div>
 
        {/* Modal Body */}
        <div style={{ padding: 24, background: "#fff" }}>
          <div style={{ maxWidth: 800, margin: "0 auto" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%", textAlign: "center", marginBottom: 20 }}>
              <span style={{ fontSize: 20, fontWeight: 900, color: "#1e293b", letterSpacing: "1px" }}>SEAWAY</span>
              <span style={{ fontSize: 11, color: "#64748b", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>Interactive Folder Face Replica</span>
            </div>
 
            {/* The heavy-border physical form recreation */}
            <div style={{ border: "3px solid #000000", background: "#ffffff", borderRadius: 4, overflow: "hidden" }}>
              
              {/* Row 1: SHIPPER, 1ST FLIGHT / DATE, 2ND FLIGHT */}
              <div style={{ display: "grid", gridTemplateColumns: "6fr 3fr 3fr", borderBottom: "3px solid #000000", minHeight: 90 }}>
                <div style={{ borderRight: "3px solid #000000", display: "flex", flexDirection: "column" }}>
                  <div style={labelStyle}>
                    SHIPPER
                  </div>
                  <div style={{ flex: 1, padding: 8 }}>
                    <textarea
                      value={js.shipper}
                      onChange={handleFieldChange("shipper")}
                      style={{ width: "100%", height: "100%", border: "none", outline: "none", fontSize: 14, fontWeight: "bold", color: "#000000", background: "transparent", resize: "none", textTransform: "uppercase" }}
                    />
                  </div>
                </div>
                <div style={{ borderRight: "3px solid #000000", display: "flex", flexDirection: "column" }}>
                  <div style={labelStyle}>
                    1ST FLIGHT / DATE
                  </div>
                  <div style={{ flex: 1, padding: 8, display: "flex", alignItems: "center" }}>
                    <input
                      value={js.firstFlight}
                      onChange={handleFieldChange("firstFlight")}
                      style={{ width: "100%", border: "none", outline: "none", fontSize: 14, fontWeight: "bold", color: "#000000", background: "transparent", textTransform: "uppercase" }}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={labelStyle}>
                    2ND FLIGHT
                  </div>
                  <div style={{ flex: 1, padding: 8, display: "flex", alignItems: "center" }}>
                    <input
                      value={js.secondFlight}
                      onChange={handleFieldChange("secondFlight")}
                      style={{ width: "100%", border: "none", outline: "none", fontSize: 14, fontWeight: "bold", color: "#000000", background: "transparent", textTransform: "uppercase" }}
                    />
                  </div>
                </div>
              </div>
 
              {/* Row 2: AWB, UNIT/ULD (EQUIPMENT USED), DEST */}
              <div style={{ display: "grid", gridTemplateColumns: "5fr 5fr 2fr", borderBottom: "3px solid #000000", minHeight: 90 }}>
                <div style={{ borderRight: "3px solid #000000", display: "flex", flexDirection: "column" }}>
                  <div style={labelStyle}>
                    AWB #
                  </div>
                  <div style={{ flex: 1, padding: 8, display: "flex", alignItems: "center" }}>
                    <input
                      value={js.awb}
                      onChange={handleFieldChange("awb")}
                      style={{ width: "100%", border: "none", outline: "none", fontSize: 14, fontWeight: "bold", color: "#000000", background: "transparent", textTransform: "uppercase" }}
                    />
                  </div>
                </div>
                <div style={{ borderRight: "3px solid #000000", display: "flex", flexDirection: "column" }}>
                  <div style={labelStyle}>
                    UNIT / ULD (EQUIPMENT USED)
                  </div>
                  <div style={{ flex: 1, padding: 8, display: "flex", alignItems: "center" }}>
                    <input
                      value={js.unit}
                      onChange={handleFieldChange("unit")}
                      style={{ width: "100%", border: "none", outline: "none", fontSize: 14, fontWeight: "bold", color: "#000000", background: "transparent", textTransform: "uppercase" }}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={labelStyle}>
                    DEST
                  </div>
                  <div style={{ flex: 1, padding: 8, display: "flex", alignItems: "center" }}>
                    <input
                      value={js.dest}
                      onChange={handleFieldChange("dest")}
                      style={{ width: "100%", border: "none", outline: "none", fontSize: 14, fontWeight: "bold", color: "#000000", background: "transparent", textTransform: "uppercase" }}
                    />
                  </div>
                </div>
              </div>
 
              {/* Row 3: CONSOL REF & JOB REF */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "3px solid #000000", minHeight: 80 }}>
                <div style={{ borderRight: "3px solid #000000", display: "flex", flexDirection: "column" }}>
                  <div style={labelStyle}>
                    CONSOL REF
                  </div>
                  <div style={{ flex: 1, padding: 8, display: "flex", alignItems: "center" }}>
                    <input
                      value={js.consolRef}
                      onChange={handleFieldChange("consolRef")}
                      style={{ width: "100%", border: "none", outline: "none", fontSize: 13, fontWeight: "bold", color: "#000000", background: "transparent", textTransform: "uppercase" }}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={labelStyle}>
                    JOB REF
                  </div>
                  <div style={{ flex: 1, padding: 8, display: "flex", alignItems: "center" }}>
                    <input
                      value={js.jobRef}
                      onChange={handleFieldChange("jobRef")}
                      style={{ width: "100%", border: "none", outline: "none", fontSize: 13, fontWeight: "bold", color: "#000000", background: "transparent", textTransform: "uppercase" }}
                    />
                  </div>
                </div>
              </div>
 
              {/* Row 4: SPECIAL INSTRUCTIONS */}
              <div style={{ display: "flex", flexDirection: "column", minHeight: 150 }}>
                <div style={labelStyle}>
                  SPECIAL INSTRUCTIONS
                </div>
                <div style={{ flex: 1, padding: 10 }}>
                  <textarea
                    value={js.specialInst}
                    onChange={handleFieldChange("specialInst")}
                    style={{ width: "100%", height: "100%", border: "none", outline: "none", fontSize: 13, fontWeight: "bold", color: "#000000", background: "transparent", resize: "none", lineHeight: "1.5", textTransform: "uppercase" }}
                  />
                </div>
              </div>
 
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
