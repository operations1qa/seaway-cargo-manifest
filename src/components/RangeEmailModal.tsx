/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import * as XLSX from "xlsx";
import { Mail, Check, Info, X, FileSpreadsheet, Download, FileText } from "lucide-react";
import { Shipment } from "../types";
import { toDisplay } from "../utils/helpers";

interface RangeEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  from: string;
  to: string;
  selectedShipments: Shipment[];
  onTriggerExcel?: () => void;
  onTriggerPdf?: () => void;
}

// Safe UTF-8 Base64 encoding helper
function base64EncodeUnicode(str: string): string {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => {
      return String.fromCharCode(parseInt(p1, 16));
    })
  );
}

// Slice long base64 strings into RFC-822 compliant chunks (76 characters max)
function chunkSubstr(str: string, size: number): string[] {
  const numChunks = Math.ceil(str.length / size);
  const chunks = new Array(numChunks);
  for (let i = 0, o = 0; i < numChunks; ++i, o += size) {
    chunks[i] = str.slice(o, o + size);
  }
  return chunks;
}

export function RangeEmailModal({ isOpen, onClose, from, to, selectedShipments }: RangeEmailModalProps) {
  const [recipientEmail, setRecipientEmail] = useState("");
  const [downloadedSuccess, setDownloadedSuccess] = useState(false);

  if (!isOpen) return null;

  const totalSelected = selectedShipments.length;
  const fromFormatted = from ? toDisplay(from) : "The Beginning";
  const toFormatted = to ? toDisplay(to) : "The End";

  const emailSubject = `[CARGO MANIFEST REPORT] Seaway Warehouse Loadsheet (${fromFormatted} - ${toFormatted})`;

  // Clean, polite email body WITHOUT any messy text extracts/dumps of rows
  const emailBody = `To Whom It May Concern,

Please find attached the official Seaway Cargo Warehouse Loadsheet Manifest Excel Spreadsheet (.xlsx) for the selected operating range (${fromFormatted} to ${toFormatted}).

Best regards,`;

  // Builds identical Excel spreadsheet in Base64
  const getRawExcelBase64 = () => {
    const uniqueDates = new Set(selectedShipments.map((r) => r.date));
    const isMultiDay = uniqueDates.size > 1 || (from && to && from !== to);

    const headers = [];
    if (isMultiDay) {
      headers.push("Date");
    }
    headers.push(
      "Cutoff",
      "AWB",
      "Flight",
      "Client (SEAWAY)",
      "Shipper",
      "ULD",
      "Destination",
      "DRY ICE",
      "CTO",
      "Commodity",
      "instructions",
      "SCR"
    );
    
    const excelRows = [
      headers,
      ...selectedShipments.map((r) => {
        const rowData = [];
        if (isMultiDay) {
          rowData.push(r.date ? toDisplay(r.date) : "—");
        }
        rowData.push(
          r.cutoff || "—",
          r.awb || "—",
          r.flight || "—",
          "SEAWAY",
          r.shipper || "—",
          r.uld || "—",
          r.dest || "—",
          r.ice && r.ice.trim() ? r.ice : "N/A",
          r.cto || "—",
          r.commodity || "—",
          r.specialInst || "—",
          r.scr || "—"
        );
        return rowData;
      })
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(excelRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Manifest");

    // Adjust column widths automatically
    const maxColWidths = excelRows[0].map((_, colIndex) => {
      const lengths = excelRows.map(row => {
        const val = row[colIndex];
        return val ? String(val).length : 5;
      });
      return Math.min(Math.max(...lengths) + 2, 45);
    });
    worksheet["!cols"] = maxColWidths.map(w => ({ wch: w }));

    const base64Out = XLSX.write(workbook, { bookType: "xlsx", type: "base64" });
    return base64Out;
  };

  // Compile and generate the EML file which opens directly in local Outlook/Mail
  const handleTriggerEmlDraft = () => {
    const boundary = "----boundary_seaway_reports_" + Date.now();
    
    const base64Excel = getRawExcelBase64();

    const cleanFrom = fromFormatted.replace(/[^a-zA-Z0-9]/g, "-");
    const cleanTo = toFormatted.replace(/[^a-zA-Z0-9]/g, "-");
    const filenameExcel = `Seaway_Warehouse_Manifest_${cleanFrom}_to_${cleanTo}.xlsx`;

    let eml = "";
    if (recipientEmail.trim()) {
      eml += `To: ${recipientEmail.trim()}\n`;
    }
    eml += `Subject: [CARGO MANIFEST REPORT] Seaway Warehouse Loadsheet (${fromFormatted} - ${toFormatted})\n`;
    eml += `X-Unsent: 1\n`; // Crucial header: outlook transforms this into an active compose window
    eml += `MIME-Version: 1.0\n`;
    eml += `Content-Type: multipart/mixed; boundary="${boundary}"\n\n`;

    // Part 1: Text Body
    eml += `--${boundary}\n`;
    eml += `Content-Type: text/plain; charset="utf-8"\n`;
    eml += `Content-Transfer-Encoding: 7bit\n\n`;
    eml += `${emailBody}\n\n`;

    // Part 2: Excel Attachment
    eml += `--${boundary}\n`;
    eml += `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; name="${filenameExcel}"\n`;
    eml += `Content-Disposition: attachment; filename="${filenameExcel}"\n`;
    eml += `Content-Transfer-Encoding: base64\n\n`;
    eml += chunkSubstr(base64Excel, 76).join("\n") + "\n\n";

    eml += `--${boundary}--`;

    const blob = new Blob([eml], { type: "message/rfc822;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Seaway_Manifest_Draft_${cleanFrom}_to_${cleanTo}.eml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setDownloadedSuccess(true);
    setTimeout(() => setDownloadedSuccess(false), 5000);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
      }}
      id="range-email-overlay"
      onClick={(e) => {
        if ((e.target as HTMLElement).id === "range-email-overlay") {
          onClose();
        }
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "540px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
          animation: "fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "90vh",
        }}
      >
        {/* Header */}
        <div
          style={{
            background: "#0284c7",
            color: "#ffffff",
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Mail size={18} />
            <div>
              <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Generate Operational Mail Draft
              </h3>
              <p style={{ margin: 0, fontSize: "11px", opacity: 0.9 }}>
                Attach reports to your native mail client for {totalSelected} shipment(s)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.15)",
              border: "none",
              color: "#ffffff",
              padding: "4px",
              borderRadius: "50%",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "24px",
              height: "24px",
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body content (scrolls) */}
        <div style={{ padding: "20px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
          
          {/* Instructions box */}
          <div
            style={{
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: "10px",
              padding: "14px",
              fontSize: "12.5px",
              color: "#1e3a8a",
              lineHeight: 1.45,
            }}
          >
            <div style={{ display: "flex", gap: "10px", alignItems: "start" }}>
              <Info size={18} style={{ flexShrink: 0, marginTop: "2px", color: "#2563eb" }} />
              <div>
                <strong style={{ display: "block", marginBottom: "4px" }}>🎯 Native Email Integration Guide:</strong>
                <p style={{ margin: 0, fontSize: "12px", opacity: 0.95 }}>
                  Since web browsers cannot directly attach files to a local mail client, we have generated an official email file (.EML format) below. 
                </p>
                <ol style={{ margin: "6px 0 0 16px", fontSize: "11.5px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  <li>Click <strong>"Generate & Open Email Draft"</strong> below.</li>
                  <li>Open the downloaded draft file.</li>
                  <li>Your default desktop program (<strong>Outlook, Apple Mail, Thunderbird, etc.</strong>) will launch a new compose window.</li>
                  <li><strong>The actual Excel (.xlsx) Manifest is already attached!</strong> No extraction blocks or manual uploading required.</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Recipient Input */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "11px", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.03em" }}>
              Recipient Address (Optional):
            </label>
            <input
              type="email"
              placeholder="e.g. operations@seaway-logistics.com"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "12.5px",
                fontWeight: 600,
                color: "#1e293b",
                outline: "none",
              }}
            />
          </div>

          {/* Pre-attached components summary */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: "#f8fafc", padding: "12px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
            <span style={{ fontSize: "11px", fontWeight: 850, color: "#64748b", textTransform: "uppercase" }}>
              📎 Embedded Draft Attachments:
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "2px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11.5px", fontWeight: 700, color: "#334155" }}>
                <FileSpreadsheet size={15} style={{ color: "#16a34a" }} />
                <span>Actual Excel Manifest Spreadsheet (.xlsx)</span>
              </div>
            </div>
          </div>

          {/* Action Row */}
          <button
            onClick={handleTriggerEmlDraft}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              background: downloadedSuccess ? "#16a34a" : "#0284c7",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              padding: "12px 14px",
              fontSize: "13px",
              fontWeight: 800,
              cursor: "pointer",
              transition: "all 0.2s",
              boxShadow: "0 2px 8px rgba(2, 132, 199, 0.15)",
            }}
            onMouseEnter={(e) => {
              if (!downloadedSuccess) e.currentTarget.style.background = "#0369a1";
            }}
            onMouseLeave={(e) => {
              if (!downloadedSuccess) e.currentTarget.style.background = "#0284c7";
            }}
          >
            <Mail size={16} />
            {downloadedSuccess ? "Draft file generated!" : "Generate & Open Email Draft"}
          </button>

          {downloadedSuccess && (
            <div style={{ fontSize: "11px", color: "#16a34a", fontWeight: 750, textAlign: "center", marginTop: "-8px", animation: "fadeIn 0.2s" }}>
              ✨ Double-click the file to open Microsoft Outlook / native mail client instantly!
            </div>
          )}

        </div>

        {/* Footer */}
        <div
          style={{
            background: "#f8fafc",
            padding: "12px 20px",
            borderTop: "1px solid #cbd5e1",
            display: "flex",
            justifyContent: "end",
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: "#475569",
              border: "none",
              color: "#ffffff",
              padding: "6px 16px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.2s"
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "#334155"}
            onMouseLeave={(e) => e.currentTarget.style.background = "#475569"}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
