import React, { useState, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { Shipment, FlightSchedule } from "../types";
import { T, cCol } from "../utils/theme";
import { toDisplay, generateJobSheetHtml, getDayOfWeek, todayStr, subtractHour, isUrgentShipment } from "../utils/helpers";
import { Pill } from "./UIAtoms";
import { 
  Calendar, 
  FileSpreadsheet, 
  Search, 
  Printer, 
  FileText, 
  X, 
  Info, 
  SlidersHorizontal, 
  Bookmark, 
  CheckCircle, 
  AlertCircle,
  Mail
} from "lucide-react";
import { RangeEmailModal } from "./RangeEmailModal";
import { AirlineInfoModal } from "./AirlineInfoModal";

interface DateRangeSearchProps {
  records: Shipment[];
  onEdit: (row: Shipment) => void;
  onDelete: (id: number) => void;
  onLoadsheet: (row: Shipment) => void;
  onJobSheet: (row: Shipment) => void;
  onToggleComplete: (id: number) => void;
  onUpdate?: (id: number, fields: Partial<Shipment>) => void;
  dupIds: Set<number>;
  dupDetails: { [id: number]: any[] };
  schedule: FlightSchedule;
  onGoToFlightSchedule?: (flightCode: string) => void;
  
  // Shared state props
  open: boolean;
  setOpen: (open: boolean) => void;
  from: string;
  setFrom: (from: string) => void;
  to: string;
  setTo: (to: string) => void;
  q: string;
  setQ: (q: string) => void;
  selectedResultIds: Set<number>;
  setSelectedResultIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  onClosePane?: () => void;
}

const DeleteButton: React.FC<{
  onDelete: (id: number) => void;
  onUpdate?: (id: number, fields: Partial<Shipment>) => void;
  id: number;
  confirmDelete?: boolean;
  deleteSured?: boolean;
}> = ({ onDelete, onUpdate, id, confirmDelete, deleteSured }) => {
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  const isConfirming = !!confirmDelete && !deleteSured;
  const isSured = !!deleteSured;
  const buttonText = isConfirming ? "SURE?" : "DELETE";

  React.useEffect(() => {
    if (!isConfirming) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        if (onUpdate) {
          onUpdate(id, { confirmDelete: false, deleteSured: false });
        }
      }
    };

    document.addEventListener("click", handleOutsideClick, true);
    return () => {
      document.removeEventListener("click", handleOutsideClick, true);
    };
  }, [isConfirming, id, onUpdate]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDelete && !deleteSured) {
      // When clicking "SURE?", save marked state: confirmDelete turns false, deleteSured turns true
      if (onUpdate) {
        onUpdate(id, { confirmDelete: false, deleteSured: true });
      }
    } else if (deleteSured) {
      // Already marked black. Clicking "DELETE" deletes completely
      onDelete(id);
    } else {
      // Normal state. Clicking "DELETE" shows "SURE?"
      if (onUpdate) {
        onUpdate(id, { confirmDelete: true, deleteSured: false });
      }
    }
  };

  return (
    <button
      ref={buttonRef}
      onClick={handleClick}
      title={isSured ? "Marked black - click to delete completely" : isConfirming ? "Click SURE to mark this row" : "Delete load record"}
      style={{
        background: isSured ? "#ef4444" : isConfirming ? "#000000" : T.redBg,
        border: `1px solid ${isSured ? "#ef4444" : isConfirming ? "#ffffff" : "#fecaca"}`,
        color: (isSured || isConfirming) ? "#ffffff" : "#000000",
        borderRadius: 4,
        padding: "3px 6px",
        cursor: "pointer",
        fontSize: 10,
        fontWeight: (isSured || isConfirming) ? 900 : 500,
        whiteSpace: "nowrap",
        transition: "all 0.1s",
      }}
    >
      {buttonText}
    </button>
  );
};

export const formatTypedDate = (val: string, prevVal: string = ""): string => {
  const clean = val.replace(/\D/g, "").slice(0, 8);
  const isDeleting = val.length < prevVal.length;

  if (isDeleting) {
    if (clean.length > 4) {
      return `${clean.slice(0, 2)}/${clean.slice(2, 4)}/${clean.slice(4)}`;
    }
    if (clean.length > 2) {
      return `${clean.slice(0, 2)}/${clean.slice(2)}`;
    }
    return clean;
  }

  if (clean.length > 4) {
    return `${clean.slice(0, 2)}/${clean.slice(2, 4)}/${clean.slice(4)}`;
  } else if (clean.length === 4) {
    return `${clean.slice(0, 2)}/${clean.slice(2, 4)}/`;
  } else if (clean.length > 2) {
    return `${clean.slice(0, 2)}/${clean.slice(2)}`;
  } else if (clean.length === 2) {
    return `${clean}/`;
  }
  return clean;
};

export const DateRangeSearch: React.FC<DateRangeSearchProps> = ({
  records,
  onEdit,
  onDelete,
  onLoadsheet,
  onJobSheet,
  onToggleComplete,
  onUpdate,
  dupIds,
  dupDetails,
  schedule,
  onGoToFlightSchedule,
  
  open,
  setOpen,
  from,
  setFrom,
  to,
  setTo,
  q,
  setQ,
  selectedResultIds,
  setSelectedResultIds,
  onClosePane,
}) => {
  const [q2, setQ2] = useState("");
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null);
  const [selectedAirlineFlight, setSelectedAirlineFlight] = useState<string | null>(null);
  const [highlightedRowId, setHighlightedRowId] = useState<number | null>(null);

  const handleScrollToRow = (rowId: number) => {
    setHighlightedRowId(rowId);
    setTimeout(() => {
      const el = document.getElementById("search-row-" + rowId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);
    setTimeout(() => {
      setHighlightedRowId(null);
    }, 2500);
  };

  // States for inline ULD/Unit Number editing
  const [editingCellId, setEditingCellId] = useState<number | null>(null);
  const [tempUld, setTempUld] = useState("");
  const [tempUnit, setTempUnit] = useState("");

  // Preserve selections across mount/unmount unless date filters or search term actually changes
  const lastFromRef = useRef(from);
  const lastToRef = useRef(to);
  const lastQRef = useRef(q);

  React.useEffect(() => {
    if (lastFromRef.current !== from || lastToRef.current !== to || lastQRef.current !== q) {
      setSelectedResultIds(new Set());
      setConfirmingDeleteId(null);
    }
    lastFromRef.current = from;
    lastToRef.current = to;
    lastQRef.current = q;
  }, [from, to, q, setSelectedResultIds]);

  const formatDateToDDMMYYYY = (d: Date): string => {
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = String(d.getFullYear());
    return `${day}${month}${year}`;
  };

  // Convert DDMMYYYY string to comparable "YYYYMMDD" integer
  const toComparableInt = (ddmmyyyy: string): number => {
    if (!ddmmyyyy || ddmmyyyy.length !== 8) return 0;
    const d = ddmmyyyy.slice(0, 2);
    const m = ddmmyyyy.slice(2, 4);
    const y = ddmmyyyy.slice(4);
    return parseInt(y + m + d, 10);
  };

  const handleFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (v) {
      const d = v.split("-");
      setFrom(d[2] + d[1] + d[0]);
    } else {
      setFrom("");
    }
  };

  const handleToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (v) {
      const d = v.split("-");
      setTo(d[2] + d[1] + d[0]);
    } else {
      setTo("");
    }
  };

  const results = useMemo(() => {
    if (!from && !to && !q.trim() && !q2.trim()) return [];
    
    const fromN = from ? toComparableInt(from) : 0;
    const toN = to ? (toComparableInt(to) || 99999999) : 99999999;
    const qL = q.toLowerCase();
    const q2L = q2.toLowerCase();

    return records
      .filter((r) => {
        const dVal = toComparableInt(r.date);
        if (fromN && dVal < fromN) return false;
        if (toN && dVal > toN) return false;
        
        const textLine = [
          r.shipper,
          r.awb,
          r.flight,
          r.dest,
          r.commodity,
          r.cto,
          r.operator,
          r.unitNum,
          r.specialInst,
          r.jobRef,
          r.consolRef
        ].join(" ").toLowerCase();

        if (qL && !textLine.includes(qL)) return false;
        if (q2L && !textLine.includes(q2L)) return false;
        
        return true;
      })
      .sort((a, b) => {
        const da = toComparableInt(a.date);
        const db = toComparableInt(b.date);
        if (da !== db) return da - db;
        
        const ca = parseInt((a.cutoff || "0").replace(/\D/g, ""), 10) || 0;
        const cb = parseInt((b.cutoff || "0").replace(/\D/g, ""), 10) || 0;
        return ca - cb;
      });
  }, [records, from, to, q, q2]);

  const getDayMismatchInfo = (flightCode: string, dateStr: string) => {
    if (!flightCode || !dateStr || dateStr.length !== 8) return null;
    const sched = schedule[flightCode.toUpperCase()];
    if (!sched) return null;

    const daysConfig = (sched.days || ".......").padEnd(7, ".");
    const s = dateStr.replace(/\D/g, "");
    if (s.length !== 8) return null;
    const day = parseInt(s.slice(0, 2), 10);
    const month = parseInt(s.slice(2, 4), 10) - 1;
    const year = parseInt(s.slice(4), 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    
    const dObj = new Date(year, month, day);
    const jsDay = dObj.getDay(); // 0-6 (Sun-Sat)
    
    // MTWTFSS index: Monday is 0, Sunday is 6
    const mtwtfssIdx = jsDay === 0 ? 6 : jsDay - 1;
    const isAllocated = daysConfig[mtwtfssIdx] !== "." && daysConfig[mtwtfssIdx] !== "-" && daysConfig[mtwtfssIdx] !== " ";
    
    if (!isAllocated) {
      const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      return {
        dayName: weekdays[jsDay],
        daysConfig: sched.days || "No days allocated",
      };
    }
    return null;
  };

  const mismatchCount = useMemo(() => {
    return results.filter(row => !row.complete && getDayMismatchInfo(row.flight, row.date)).length;
  }, [results, schedule]);

  const urgentSearchCount = useMemo(() => {
    return results.filter((r) => isUrgentShipment(r)).length;
  }, [results]);

  const duplicateSearchRecords = useMemo(() => {
    return results.filter((r) => dupIds.has(r.id));
  }, [results, dupIds]);

  const duplicateSearchCount = duplicateSearchRecords.length;

  // Bulk print functionality matching ShipmentsTab
  const printSelectedSearchJobSheets = () => {
    const rows = results.filter((r) => selectedResultIds.has(r.id));
    if (rows.length === 0) {
      alert("No job sheets selected. Tick the rows you wish to print first.");
      return;
    }
    const win = window.open("", "_blank", "width=1000,height=800");
    if (!win) return;

    const jobHtml = rows
      .map((row) => generateJobSheetHtml(row))
      .join("");

    win.document.write(`<!DOCTYPE html><html><head><title>Job Cover Sheets</title><style>
      *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
      body{font-family:Arial,sans-serif;color:#000;background:#fff;text-transform:uppercase;}
      .title-box{text-align:center;font-size:20px;font-weight:900;border:4px solid #000;padding:10px;margin-bottom:12px;letter-spacing:3px;text-transform:uppercase;background:#fff !important;color:#000 !important;}
      .grid-box{border:4px solid #000000;overflow:hidden;background:#fff !important;}
      .row-split-3{display:grid;grid-template-columns: 6fr 3fr 3fr;border-bottom:4px solid #000000;min-height:85px;}
      .row-split-awb-unit-dest{display:grid;grid-template-columns: 5fr 5fr 2fr;border-bottom:4px solid #000000;min-height:85px;}
      .row-split-2{display:grid;grid-template-columns: 1fr 1fr;border-bottom:4px solid #000000;min-height:75px;}
      .label-block{background:#000000 !important;color:#ffffff !important;font-weight:bold;font-size:13px;padding:6px 10px;border-bottom:2px solid #000;text-transform:uppercase;font-family:monospace;letter-spacing:1px;-webkit-print-color-adjust: exact !important;print-color-adjust: exact !important;}
      .value-block{flex:1;padding:8px;font-size:14px;font-weight:900;text-transform:uppercase;color:#000 !important;white-space:pre-wrap;background:#fff !important;}
      .cell{display:flex;flex-direction:column;}
      .cell-br{border-right:4px solid #000000;}
      .inst-row{display:flex;flex-direction:column;min-height:140px;}
      
      @media print {
        @page {
          size: A4 portrait;
          margin: 10mm 12mm;
        }
        body {
          margin: 0;
          padding: 0;
        }
        .job-sheet-page {
          padding: 0 !important;
          margin: 0 !important;
          page-break-after: always !important;
          page-break-inside: avoid !important;
          break-after: page !important;
          break-inside: avoid !important;
        }
        .job-sheet-page:last-child {
          page-break-after: avoid !important;
          break-after: avoid !important;
        }
        .title-box {
          border-width: 4px;
        }
        .grid-box {
          border-width: 4px;
        }
      }
      @media screen {
        .job-sheet-page {
          border-bottom: 2px dashed #94a3b8;
          padding-bottom: 30px !important;
          margin-bottom: 35px !important;
          max-width: 800px;
          margin-left: auto;
          margin-right: auto;
        }
      }
    </style></head><body>${jobHtml}</body></html>`);

    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 500);
  };

  const printRangeToPDF = () => {
    const selectedShowing = results.filter((r) => selectedResultIds.has(r.id));
    const itemsToProcess = selectedShowing.length > 0 ? selectedShowing : results;

    if (itemsToProcess.length === 0) {
      alert("No search results to print in range PDF.");
      return;
    }

    const win = window.open("", "_blank", "width=1200,height=800");
    if (!win) return;

    const fromFormatted = from ? toDisplay(from) : "ANY";
    const toFormatted = to ? toDisplay(to) : "ANY";

    const tableRowsHtml = itemsToProcess.map((r) => {
      const hasUld = r.unitNum && r.unitNum !== "—" && r.unitNum.trim() !== "";
      const uldNumberDisplay = hasUld ? r.unitNum : "";

      return `
        <tr style="background: #ffffff; border-bottom: 2px solid #94a3b8;">
          <td style="padding: 30px 8px; font-weight: 800; color: #1e293b; font-size: 11px;">${toDisplay(r.date)}</td>
          <td style="padding: 30px 8px; font-weight: 800; color: #0284c7; font-size: 11px;">${r.cutoff || "—"}</td>
          <td style="padding: 30px 8px; font-weight: 800; font-size: 11px;">${r.flight || "—"}</td>
          <td style="padding: 30px 8px; font-weight: 700; font-size: 11px;">${r.awb || "—"}</td>
          <td style="padding: 30px 8px; font-size: 10px; font-weight: 700; color: #1e293b;">SEAWAY</td>
          <td style="padding: 30px 8px; font-size: 10px; font-weight: 600; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${r.shipper || "—"}</td>
          <td style="padding: 30px 8px; font-size: 10px; font-weight: 600;">${r.uld || "—"}</td>
          <td style="padding: 30px 8px; font-size: 11px; font-family: monospace; font-weight: 700; color: #000000; min-width: 120px;">${uldNumberDisplay}</td>
          <td style="padding: 30px 8px; font-weight: 700; color: #b45309; font-size: 11px;">${r.dest || "—"}</td>
          <td style="padding: 30px 8px; font-weight: 700; color: #000000; font-size: 11px;">${r.ice && r.ice.trim() ? r.ice : "N/A"}</td>
          <td style="padding: 30px 8px; font-size: 10px; font-weight: 600;">${r.commodity || "—"}</td>
          <td style="padding: 30px 8px; font-size: 10px; font-weight: 600; background: #fffbeb; color: #92400e;">${r.specialInst || "—"}</td>
          <td style="padding: 30px 8px; font-size: 10px; font-weight: 700;">${r.cto || "—"}</td>
        </tr>
      `;
    }).join("");

    const totalLoads = itemsToProcess.length;
    const checkedLoads = itemsToProcess.filter((r) => r.complete).length;
    const pendingLoads = totalLoads - checkedLoads;

    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Range Warehouse Loadsheet PDF</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; background: #ffffff; padding: 20px; }
            .header-container { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0284c7; padding-bottom: 15px; margin-bottom: 20px; }
            .logo-title { font-size: 24px; font-weight: 900; color: #0f172a; letter-spacing: 0.5px; }
            .subtitle { font-size: 12px; color: #0284c7; font-weight: 800; margin-top: 2px; text-transform: uppercase; letter-spacing: 1px; }
            .metadata-box { text-align: right; }
            .date-title { font-size: 16px; font-weight: 700; color: #0284c7; }
            .date-day { font-size: 12px; color: #475569; font-weight: 600; margin-top: 2px; }
            .stats-bar { display: flex; gap: 15px; margin-bottom: 20px; background: #f1f5f9; padding: 10px 15px; border-radius: 8px; font-size: 11px; font-weight: 700; color: #334155; border: 1px solid #e2e8f0; }
            .stat-pill { background: #ffffff; padding: 4px 8px; border-radius: 4px; border: 1px solid #cbd5e1; }
            table { width: 100%; border-collapse: collapse; text-transform: uppercase; font-size: 10.5px; }
            th { border-bottom: 2px solid #0f172a; padding: 10px 8px; font-weight: 700; text-align: left; font-size: 9.5px; letter-spacing: 0.5px; }
            td { border-bottom: 1px solid #cbd5e1; }
            .footer-signoff { margin-top: 60px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; padding-top: 20px; border-top: 1px dashed #cbd5e1; }
            .sign-box { border-bottom: 1px solid #64748b; height: 45px; position: relative; }
            .sign-lbl { font-size: 9px; font-weight: 700; color: #64748b; margin-top: 5px; text-transform: uppercase; }
            @media print {
              @page { size: landscape; margin: 8mm 10mm; }
              body { padding: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header-container">
            <div>
              <div class="logo-title">SEAWAY</div>
              <div class="subtitle">SEAWAY</div>
            </div>
            <div class="metadata-box">
              <div class="date-title">RANGE WAREHOUSE LOADSHEET PDF</div>
              <div class="date-day">FROM ${fromFormatted} TO ${toFormatted}</div>
            </div>
          </div>

          <div class="stats-bar">
            <div>RANGE MANIFEST SUMMARY:</div>
            <div class="stat-pill">TOTAL SHIPMENTS: ${totalLoads}</div>
            <div class="stat-pill" style="color: #166534; background: #f0fdf4;">CHECKED OFF: ${checkedLoads}</div>
            <div class="stat-pill" style="color: #b45309; background: #fffbeb;">PENDING OPERATIONAL SIGN-OFF: ${pendingLoads}</div>
          </div>

          <table>
            <thead>
              <tr style="background: #f1f5f9;">
                <th style="width: 85px;">DATE</th>
                <th style="width: 70px;">CUTOFF</th>
                <th style="width: 75px;">FLIGHT</th>
                <th style="width: 105px;">AWB NO.</th>
                <th style="width: 65px;">CLIENT</th>
                <th>SHIPPER</th>
                <th style="width: 80px;">ULD TYPE</th>
                <th style="width: 120px;">ULD NUMBER</th>
                <th style="width: 60px;">DEST</th>
                <th style="width: 80px;">DRY ICE</th>
                <th style="width: 90px;">COMMODITY</th>
                <th>SPECIAL INSTRUCTIONS & COLD CHAIN</th>
                <th style="width: 80px;">CTO</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHtml}
            </tbody>
          </table>

          <div class="footer-signoff">
            <div>
              <div class="sign-box"></div>
              <div class="sign-lbl">Prepared By (Export Officer Office Staff)</div>
            </div>
            <div>
              <div class="sign-box"></div>
              <div class="sign-lbl">Checked By (Lead Hand warehouse Supervisor)</div>
            </div>
            <div>
              <div class="sign-box" style="border: none; display: flex; align-items: flex-end; font-size: 10px; font-weight: 700; color: #475569;">
                Date & Time printed: ${new Date().toLocaleString()}
              </div>
              <div class="sign-lbl">Print Generation Timestamp</div>
            </div>
          </div>

          <script>
            window.focus();
            setTimeout(function() {
              window.print();
            }, 800);
          </script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const exportRangeToExcel = () => {
    const selectedShowing = results.filter((r) => selectedResultIds.has(r.id));
    const itemsToProcess = selectedShowing.length > 0 ? selectedShowing : results;

    if (itemsToProcess.length === 0) {
      alert("No search results to export.");
      return;
    }
    
    const uniqueDates = new Set(itemsToProcess.map((r) => r.date));
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
      ...itemsToProcess.map((r) => {
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

    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    
    const fromFormatted = from ? toDisplay(from).replace(/\//g, "-") : "ANY";
    const toFormatted = to ? toDisplay(to).replace(/\//g, "-") : "ANY";
    a.download = `Range_Warehouse_Loadsheet_${fromFormatted}_to_${toFormatted}.xlsx`;
    
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSelectRow = (id: number) => {
    setSelectedResultIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isAllSelected = results.length > 0 && results.every((r) => selectedResultIds.has(r.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedResultIds((prev) => {
        const next = new Set(prev);
        results.forEach((r) => next.delete(r.id));
        return next;
      });
    } else {
      setSelectedResultIds((prev) => {
        const next = new Set(prev);
        results.forEach((r) => next.add(r.id));
        return next;
      });
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          color: T.accent,
          borderRadius: 6,
          padding: "7px 14px",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          alignSelf: "flex-start",
          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
        }}
      >
        📅 Search Date Range…
      </button>
    );
  }

  const selectedCount = selectedResultIds.size;
  const selectedShowingCount = results.filter((r) => selectedResultIds.has(r.id)).length;
  const printCount = selectedShowingCount > 0 ? selectedShowingCount : results.length;

  return (
    <div
      style={{
        background: T.surface,
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: "14px 16px",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.03)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* 1. Sticky Header Controls Panel (Always Locked at the Top) */}
      <div
        style={{
          position: "sticky",
          top: -14, // Aligns perfectly to the compact parent padding offset
          background: T.surface,
          zIndex: 20,
          paddingTop: "2px",
          paddingBottom: "10px",
          borderBottom: "1px solid #f1f5f9",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {/* 1. Archive Search Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingBottom: 2,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                background: T.accentBg,
                color: T.accent,
                borderRadius: "50%",
                width: 28,
                height: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <SlidersHorizontal size={14} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: T.text, letterSpacing: "-0.01em" }}>
                Date Range Archive Search
              </h3>
              <p style={{ margin: 0, fontSize: 10, color: T.textMuted, fontWeight: 500 }}>
                Query history & print bulk templates or customized PDF manifest reports
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                background: "#f1f5f9",
                color: T.textMid,
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 10,
                border: "1px solid #e2e8f0",
              }}
            >
              📊 {records.length} Total Records
            </span>

            <button
              onClick={() => {
                if (onClosePane) {
                  onClosePane();
                } else {
                  setOpen(false);
                  setFrom("");
                  setTo("");
                  setQ("");
                  setQ2("");
                  setSelectedResultIds(new Set());
                }
              }}
              style={{
                background: "#fee2e2",
                border: "1px solid #fca5a5",
                color: "#991b1b",
                borderRadius: 16,
                padding: "4px 10px",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 3,
                transition: "all 0.1s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#fca5a5";
                e.currentTarget.style.color = "#7f1d1d";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#fee2e2";
                e.currentTarget.style.color = "#991b1b";
              }}
            >
              <X size={12} />
              <span>Close Search</span>
            </button>
          </div>
        </div>

        {/* 2. Advanced Search Filter Inputs (Grid Block) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
            background: "#fafafa",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #f1f5f9",
          }}
        >
          {/* From Date Filter */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 10, color: T.textMid, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em" }}>
              FROM DATE {from ? `(${toDisplay(from)})` : ""}
            </label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                borderRadius: 6,
                padding: "5px 8px",
                boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                gap: 6,
              }}
            >
              <input
                type="text"
                placeholder="DD/MM/YYYY"
                value={toDisplay(from)}
                onChange={(e) => {
                  const lastVal = toDisplay(from);
                  const formatted = formatTypedDate(e.target.value, lastVal);
                  setFrom(formatted.replace(/\D/g, ""));
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: 11,
                  fontWeight: 700,
                  color: T.text,
                  outline: "none",
                  flex: 1,
                }}
              />
              <div style={{ position: "relative", width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <Calendar size={13} style={{ color: T.accent, pointerEvents: "none" }} />
                <input
                  type="date"
                  value={from.length === 8 ? `${from.slice(4)}-${from.slice(2, 4)}-${from.slice(0, 2)}` : ""}
                  onChange={handleFromChange}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    opacity: 0,
                    cursor: "pointer",
                  }}
                />
              </div>
            </div>
          </div>

          {/* To Date Filter */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 10, color: T.textMid, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em" }}>
              TO DATE {to ? `(${toDisplay(to)})` : ""}
            </label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                borderRadius: 6,
                padding: "5px 8px",
                boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                gap: 6,
              }}
            >
              <input
                type="text"
                placeholder="DD/MM/YYYY"
                value={toDisplay(to)}
                onChange={(e) => {
                  const lastVal = toDisplay(to);
                  const formatted = formatTypedDate(e.target.value, lastVal);
                  setTo(formatted.replace(/\D/g, ""));
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: 11,
                  fontWeight: 700,
                  color: T.text,
                  outline: "none",
                  flex: 1,
                }}
              />
              <div style={{ position: "relative", width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <Calendar size={13} style={{ color: T.accent, pointerEvents: "none" }} />
                <input
                  type="date"
                  value={to.length === 8 ? `${to.slice(4)}-${to.slice(2, 4)}-${to.slice(0, 2)}` : ""}
                  onChange={handleToChange}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    opacity: 0,
                    cursor: "pointer",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Filter 1 Search Filter */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 10, color: T.textMid, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em" }}>
              Filter 1
            </label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                borderRadius: 6,
                padding: "5px 8px",
                boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                gap: 6,
              }}
            >
              <Search size={13} style={{ color: T.textMuted }} />
              <input
                type="text"
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: 11,
                  color: T.text,
                  fontWeight: 700,
                  outline: "none",
                  flex: 1,
                  textTransform: "uppercase",
                }}
                placeholder=""
                value={q}
                onChange={(e) => setQ(e.target.value.toUpperCase())}
              />
              {q && (
                <button
                  onClick={() => setQ("")}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: T.textMuted,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Filter 2 Search Filter */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 10, color: T.textMid, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em" }}>
              Filter 2
            </label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                borderRadius: 6,
                padding: "5px 8px",
                boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                gap: 6,
              }}
            >
              <Search size={13} style={{ color: T.textMuted }} />
              <input
                type="text"
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: 11,
                  color: T.text,
                  fontWeight: 700,
                  outline: "none",
                  flex: 1,
                  textTransform: "uppercase",
                }}
                placeholder=""
                value={q2}
                onChange={(e) => setQ2(e.target.value.toUpperCase())}
              />
              {q2 && (
                <button
                  onClick={() => setQ2("")}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: T.textMuted,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 3. Date Presets Bar */}
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            flexWrap: "wrap",
            paddingBottom: 2,
            borderBottom: "1px solid #f1f5f9",
          }}
        >
          <span style={{ fontSize: 9, fontWeight: 800, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginRight: 2 }}>
            🗓 QUICK PRESETS:
          </span>
          {[
            { label: "Today", value: "today" },
            { label: "Tomorrow", value: "tomorrow" },
            { label: "Next 4 Days", value: "next4days" },
            { label: "Next 30 Days", value: "next30days" },
            { label: "Clear Filters", value: "clear" },
          ].map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => {
                if (preset.value === "today") {
                  const tStr = todayStr();
                  setFrom(tStr);
                  setTo(tStr);
                } else if (preset.value === "tomorrow") {
                  const d = new Date();
                  d.setDate(d.getDate() + 1);
                  const tomStr = formatDateToDDMMYYYY(d);
                  setFrom(tomStr);
                  setTo(tomStr);
                } else if (preset.value === "next4days") {
                  const start = new Date();
                  const end = new Date();
                  end.setDate(start.getDate() + 3);
                  setFrom(formatDateToDDMMYYYY(start));
                  setTo(formatDateToDDMMYYYY(end));
                } else if (preset.value === "next30days") {
                  const start = new Date();
                  const end = new Date();
                  end.setDate(start.getDate() + 29);
                  setFrom(formatDateToDDMMYYYY(start));
                  setTo(formatDateToDDMMYYYY(end));
                } else if (preset.value === "clear") {
                  setFrom("");
                  setTo("");
                  setQ("");
                  setQ2("");
                  setSelectedResultIds(new Set());
                }
              }}
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "2px 8px",
                fontSize: "10px",
                fontWeight: 700,
                color: T.textMid,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#eff6ff";
                e.currentTarget.style.borderColor = T.accent;
                e.currentTarget.style.color = T.accent;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#ffffff";
                e.currentTarget.style.borderColor = "#e2e8f0";
                e.currentTarget.style.color = T.textMid;
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* 4. Active Filter Summary Indicator */}
        {(from || to || q.trim() || q2.trim()) && (
          <div
            style={{
              background: "#f0f7ff",
              border: "1px solid #bae6fd",
              borderRadius: 8,
              padding: "6px 10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Info size={13} style={{ color: T.accent, flexShrink: 0 }} />
              <div style={{ fontSize: 11, color: "#0369a1", fontWeight: 600 }}>
                Searching loadsheets from{" "}
                <strong style={{ fontWeight: 800, color: "#0f172a" }}>
                  {from ? toDisplay(from) : "The Beginning"}
                </strong>{" "}
                to{" "}
                <strong style={{ fontWeight: 800, color: "#0f172a" }}>
                  {to ? toDisplay(to) : "The End"}
                </strong>
                {q.trim() && (
                  <span>
                    {" "}with Filter 1: "
                    <strong style={{ fontWeight: 800, color: "#0f172a" }}>{q}</strong>"
                  </span>
                )}
                {q2.trim() && (
                  <span>
                    {" "}and Filter 2: "
                    <strong style={{ fontWeight: 800, color: "#0f172a" }}>{q2}</strong>"
                  </span>
                )}
              </div>
            </div>
            <span
              style={{
                background: T.accent,
                color: "#ffffff",
                fontSize: 10,
                fontWeight: 800,
                padding: "2px 8px",
                borderRadius: 10,
              }}
            >
              {results.length} matched records
            </span>
          </div>
        )}

        {/* 5. Action Buttons (Always Visible at the Top) */}
        {results.length > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-start",
              gap: 8,
              paddingTop: 2,
              paddingBottom: 2,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {/* Bulk Print Selected */}
            <button
              onClick={printSelectedSearchJobSheets}
              disabled={selectedShowingCount === 0}
              title={selectedShowingCount === 0 ? "Check/tick shipments from the search list to print job sheets" : "Bulk Print Selected Job Sheets"}
              style={{
                background: selectedShowingCount > 0 ? "#fffbeb" : "#f8fafc",
                border: `1px solid ${selectedShowingCount > 0 ? "#fde68a" : "#e2e8f0"}`,
                color: selectedShowingCount > 0 ? "#b45309" : "#94a3b8",
                borderRadius: 16,
                padding: "6px 12px",
                cursor: selectedShowingCount > 0 ? "pointer" : "not-allowed",
                fontSize: 11,
                fontWeight: 850,
                display: "flex",
                alignItems: "center",
                gap: 6,
                boxShadow: selectedShowingCount > 0 ? "0 2px 6px rgba(217, 119, 6, 0.05)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              <Printer size={13} />
              <span>Bulk Print Job Sheets {selectedShowingCount > 0 ? `(${selectedShowingCount})` : ""}</span>
            </button>

            {/* Export Selected PDF */}
            <button
              onClick={printRangeToPDF}
              disabled={selectedShowingCount === 0}
              title={selectedShowingCount === 0 ? "Check/tick shipments from the search list to print PDF Manifest" : "Print selected shipments manifest report"}
              style={{
                background: selectedShowingCount > 0 ? "#ecfeff" : "#f8fafc",
                border: `1px solid ${selectedShowingCount > 0 ? "#a5f3fc" : "#e2e8f0"}`,
                color: selectedShowingCount > 0 ? "#0891b2" : "#94a3b8",
                borderRadius: 16,
                padding: "6px 12px",
                cursor: selectedShowingCount > 0 ? "pointer" : "not-allowed",
                fontSize: 11,
                fontWeight: 850,
                display: "flex",
                alignItems: "center",
                gap: 6,
                boxShadow: selectedShowingCount > 0 ? "0 2px 6px rgba(8, 145, 178, 0.05)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              <FileText size={13} />
              <span>Print to PDF {selectedShowingCount > 0 ? `(${selectedShowingCount})` : ""}</span>
            </button>

             <button
              onClick={exportRangeToExcel}
              disabled={selectedShowingCount === 0}
              title={selectedShowingCount === 0 ? "Check/tick shipments from the search list to Excel" : "Export selected shipments as Excel (.xlsx)"}
              style={{
                background: selectedShowingCount > 0 ? "#f0fdf4" : "#f8fafc",
                border: `1px solid ${selectedShowingCount > 0 ? "#bbf7d0" : "#e2e8f0"}`,
                color: selectedShowingCount > 0 ? "#166534" : "#94a3b8",
                borderRadius: 16,
                padding: "6px 12px",
                cursor: selectedShowingCount > 0 ? "pointer" : "not-allowed",
                fontSize: 11,
                fontWeight: 850,
                display: "flex",
                alignItems: "center",
                gap: 6,
                boxShadow: selectedShowingCount > 0 ? "0 2px 6px rgba(22, 101, 52, 0.05)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              <FileSpreadsheet size={13} />
              <span>Export to Excel {selectedShowingCount > 0 ? `(${selectedShowingCount})` : ""}</span>
            </button>

            {/* Email Range Report Option */}
            <button
              onClick={() => setShowEmailModal(true)}
              disabled={selectedShowingCount === 0}
              title={selectedShowingCount === 0 ? "Check/tick shipments from the search list to construct email" : "Email selected shipments PDF & Excel data"}
              style={{
                background: selectedShowingCount > 0 ? "#fef3c7" : "#f8fafc",
                border: `1px solid ${selectedShowingCount > 0 ? "#fde68a" : "#e2e8f0"}`,
                color: selectedShowingCount > 0 ? "#d97706" : "#94a3b8",
                borderRadius: 16,
                padding: "6px 12px",
                cursor: selectedShowingCount > 0 ? "pointer" : "not-allowed",
                fontSize: 11,
                fontWeight: 850,
                display: "flex",
                alignItems: "center",
                gap: 6,
                boxShadow: selectedShowingCount > 0 ? "0 2px 6px rgba(217, 119, 6, 0.05)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              <Mail size={13} />
              <span>Email Report {selectedShowingCount > 0 ? `(${selectedShowingCount})` : ""}</span>
            </button>

            {selectedShowingCount > 0 && (
              <button
                onClick={() => setSelectedResultIds(new Set())}
                style={{
                  marginLeft: "auto",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 10,
                  color: T.accent,
                  fontWeight: 700,
                  textDecoration: "underline",
                }}
              >
                Reset Checks ({selectedShowingCount})
              </button>
            )}
          </div>
        )}
      </div>

      {/* 6. Independent Scrollable Search Results Table */}
      {results.length > 0 ? (
        <>
          {duplicateSearchCount > 0 && (
            <div style={{ background: T.amberBg, border: `1px solid ${T.amber}44`, borderRadius: 16, padding: "14px 20px", boxShadow: "0 8px 24px rgba(0,0,0,0.03)", marginBottom: 12 }}>
              <div style={{ fontWeight: 700, color: "#b45309", fontSize: 13, marginBottom: 8 }}>
                ⚠️ Duplicate Airway Bill (AWB) or Container ULD Collisions Detected:
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {results
                  .filter((r) => dupIds.has(r.id))
                  .map((r) => (
                    <div
                      key={r.id}
                      onClick={() => handleScrollToRow(r.id)}
                      style={{
                        fontSize: 12,
                        color: T.textMid,
                        background: "#ffffff",
                        border: "1px solid #f3f4f6",
                        borderRadius: 12,
                        padding: "8px 14px",
                        display: "flex",
                        gap: 12,
                        flexWrap: "wrap",
                        alignItems: "center",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
                        cursor: "pointer",
                        transition: "all 0.15s ease-in-out",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "translateY(-1px)";
                        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.05)";
                        e.currentTarget.style.borderColor = T.accent;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "none";
                        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.02)";
                        e.currentTarget.style.borderColor = "#f3f4f6";
                      }}
                      title="Click to automatically scroll to this shipment record in the search results table"
                    >
                      <strong style={{ color: "#000000" }}>{r.shipper} (Flight {r.flight})</strong>
                      {dupDetails[r.id]?.map((d, idx) => (
                        <div key={idx} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", fontSize: "11px" }}>
                          <span style={{ background: T.amberBg, borderRadius: 12, padding: "3px 10px", color: "#b45309", fontWeight: 700 }}>
                            {d.type}: <strong>{d.value}</strong>
                          </span>
                          <span style={{ color: "#4b5563", fontWeight: 500 }}>
                            {d.count}× entries detected on:
                          </span>
                          {d.conflicts?.map((c: any, cidx: number) => (
                            <span key={cidx} style={{ background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "2px 8px", color: "#000000", fontWeight: 700, fontSize: "10px" }} title={`Shipper: ${c.shipper}`}>
                              📅 {toDisplay(c.date)} ({c.flight})
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {urgentSearchCount > 0 && (
            <div style={{ background: T.redBg, border: `1px solid ${T.red}44`, borderRadius: 16, padding: "14px 20px", boxShadow: "0 8px 24px rgba(0,0,0,0.03)", marginBottom: 12 }}>
              <div style={{ fontWeight: 700, color: T.red, fontSize: 13, marginBottom: 8 }}>
                ⏰ 2H Cutoff Alert: {urgentSearchCount} matched shipment{urgentSearchCount !== 1 ? "s" : ""} approaching or past cutoff (within 2 hours) and NOT completed:
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {results
                  .filter((r) => isUrgentShipment(r))
                  .map((r) => (
                    <div
                      key={r.id}
                      onClick={() => handleScrollToRow(r.id)}
                      style={{
                        fontSize: 12,
                        color: T.textMid,
                        background: "#ffffff",
                        border: "1px solid #f3f4f6",
                        borderRadius: 12,
                        padding: "8px 14px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
                        cursor: "pointer",
                        transition: "all 0.15s ease-in-out",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "translateY(-1px)";
                        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.05)";
                        e.currentTarget.style.borderColor = T.accent;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "none";
                        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.02)";
                        e.currentTarget.style.borderColor = "#f3f4f6";
                      }}
                      title="Click to automatically scroll to this shipment record in the search results table"
                    >
                      <div>
                        <strong style={{ color: "#000000" }}>{r.shipper} (Flight {r.flight})</strong>
                        <span style={{ marginLeft: 8, color: "#4b5563" }}>Date: <strong>{toDisplay(r.date)}</strong></span>
                        <span style={{ marginLeft: 8, color: "#4b5563" }}>AWB: <strong>{r.awb || "—"}</strong></span>
                        <span style={{ marginLeft: 8, color: "#4b5563" }}>Dest: <strong>{r.dest || "—"}</strong></span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ background: "#ef4444", color: "#ffffff", fontSize: "11px", fontWeight: 800, padding: "3px 10px", borderRadius: 12, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          ⏰ Cutoff: {r.cutoff}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {mismatchCount > 0 && (
            <div
              style={{
                background: "#fffbeb",
                border: "1px dashed #f59e0b",
                color: "#b45309",
                padding: "12px 16px",
                borderRadius: "12px",
                fontSize: "12.5px",
                fontWeight: "bold",
                marginBottom: "12px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                lineHeight: "1.4",
                boxShadow: "0 1px 3px rgba(0,0,0,0.02)"
              }}
            >
              <span style={{ fontSize: "16px" }}>⚠️</span>
              <div>
                <strong>Flight Day Schedule Conflict Alert:</strong> There are <strong>{mismatchCount} shipment(s)</strong> below that fall on a day of the week with no scheduled flights for their respective carrier. Check indicators next to Flight below.
              </div>
            </div>
          )}
          <div
            style={{
              overflowX: "auto",
              maxHeight: "500px",
              minHeight: "220px",
              overflowY: "auto",
              border: `1px solid ${T.border}`,
              borderRadius: "12px",
              boxShadow: "inset 0 1px 4px rgba(0,0,0,0.02)",
            }}
          >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead style={{ position: "sticky", top: 0, background: "#f8fafc", zIndex: 10 }}>
              <tr style={{ borderBottom: `2px solid ${T.border}`, background: "#f8fafc" }}>
                <th style={{ padding: "10px 12px", width: 40, textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    style={{ cursor: "pointer", transform: "scale(1.1)" }}
                  />
                </th>
                {["✓ Complete", "Date", "Cutoff", "AWB", "Flight", "Shipper", "ULD", "Dest", "Dry Ice", "Commodity", "CTO", "SCR", "Load Type", "Operator", "Actions"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 12px",
                      textAlign: h === "✓ Complete" ? "center" : "left",
                      color: h === "✓ Complete" ? "#15803d" : "#1e293b",
                      fontWeight: 800,
                      fontSize: 10,
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                      letterSpacing: "0.03em",
                      width: h === "Actions" ? 250 : h === "✓ Complete" ? 90 : undefined,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
               {results.map((row, i) => {
                const isComplete = !!row.complete;
                const isDup = dupIds.has(row.id);
                const isRowSelected = selectedResultIds.has(row.id);
                const mismatchInfo = !isComplete ? getDayMismatchInfo(row.flight, row.date) : null;
                const isConfirmingDelete = !!row.confirmDelete;
                const isSuredDelete = !!row.deleteSured;
                const isDeleting = !!row.isDeleted;
                const isDeletedOrSured = isDeleting || isSuredDelete;
                const isUrgent = isUrgentShipment(row);

                let bg = i % 2 === 0 ? T.surface : T.surface2;
                if (row.id === highlightedRowId) bg = "#fde047"; // High-visibility gold/yellow
                else if (isComplete) bg = "#d1fae5"; // Beautiful rich completed green once closed
                else if (isUrgent) bg = "#fee2e2";
                else if (isDup && !isComplete) bg = T.amberBg;
                else if (mismatchInfo) bg = "#fffdf5"; // soft beige-yellow for schedule mismatch
                else if (isRowSelected) bg = T.accentBg;
                if (isDeletedOrSured && row.id !== highlightedRowId) bg = "#000000"; // Black background for the marked/delete stage
                
                const hoverBg = isDeletedOrSured && row.id !== highlightedRowId
                  ? "#18181b" 
                  : (row.id === highlightedRowId
                      ? "#facc15" // Hover yellow-400
                      : (isConfirmingDelete
                          ? "#fee2e2"
                          : (isComplete 
                              ? "#b1f2d2" 
                              : isUrgent 
                                ? "#fca5a5" 
                                : isDup 
                                  ? "#ffedd5" 
                                  : mismatchInfo 
                                    ? "#fffbeb" 
                                    : isRowSelected 
                                      ? "#e0f2fe" 
                                      : T.accentBg)));

                return (
                  <tr 
                    id={"search-row-" + row.id}
                    key={row.id} 
                    style={{ 
                      borderBottom: `1px solid ${row.id === highlightedRowId ? "#eab308" : (isDeletedOrSured ? "#3f3f46" : (isComplete ? "#a7f3d0" : isUrgent ? "#fca5a5" : mismatchInfo ? "#fef3c7" : T.border))}`, 
                      background: bg,
                      transition: "background-color 0.4s ease, border-color 0.4s ease",
                      opacity: isComplete ? 0.85 : 1,
                      outline: row.id === highlightedRowId ? "3px solid #eab308" : "none",
                      outlineOffset: "-3px",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = hoverBg)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = bg)}
                  >
                    {/* Multiselect Checkbox */}
                    <td style={{ padding: "8px 12px", textAlign: "center", width: 40 }}>
                      <input
                        type="checkbox"
                        checked={isRowSelected}
                        onChange={() => toggleSelectRow(row.id)}
                        style={{ cursor: "pointer", transform: "scale(1.1)" }}
                      />
                    </td>
                    {/* Job Complete Checkbox (Close Jobs column) */}
                    <td style={{ padding: "8px 12px", textAlign: "center", width: 90 }}>
                      <input
                        type="checkbox"
                        checked={isComplete}
                        onChange={() => onToggleComplete(row.id)}
                        style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#15803d" }}
                        title={isComplete ? "Mark incomplete" : "Mark completed / closed"}
                      />
                    </td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: isDeletedOrSured ? "#ffffff" : (isComplete ? "#166534" : "#1e293b"), whiteSpace: "nowrap", textDecoration: isComplete ? "line-through" : "none" }}>
                      {toDisplay(row.date)}
                    </td>
                    <td style={{ 
                      padding: "8px 12px", 
                      fontFamily: "monospace", 
                      fontWeight: 800, 
                      color: isDeletedOrSured ? "#ffffff" : isComplete ? "#166534" : isUrgent ? "#991b1b" : "#0f172a", 
                      textDecoration: isComplete ? "line-through" : "none",
                      whiteSpace: "nowrap"
                    }}>
                      {row.cutoff}
                      {isUrgent && (
                        <span 
                          style={{ 
                            marginLeft: 6, 
                            fontSize: 9, 
                            background: "#ef4444", 
                            color: "#ffffff", 
                            padding: "2px 5px", 
                            borderRadius: 4, 
                            fontWeight: 800,
                            display: "inline-flex",
                            alignItems: "center"
                          }}
                          title="Within 2 hours of flight cutoff!"
                        >
                          ⚠️ 2H CUTOFF
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 10, color: isDeletedOrSured ? "#ffffff" : (isComplete ? "#166534" : "#1e293b"), fontWeight: 700, textDecoration: isComplete ? "line-through" : "none" }}>
                      {isDup ? "⚠ " : ""}
                      {row.awb}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <span style={{ textDecoration: isComplete ? "line-through" : "none", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <span
                          onClick={() => onGoToFlightSchedule?.(row.flight)}
                          style={{ cursor: onGoToFlightSchedule ? "pointer" : "default" }}
                          title={onGoToFlightSchedule ? "Click to view flight details in Flight Admin" : undefined}
                        >
                          <Pill text={row.flight} color={isComplete ? "#16a34a" : isDeletedOrSured ? "#27272a" : T.accent} textColor={isDeletedOrSured ? "#ffffff" : undefined} />
                        </span>
                        {mismatchInfo && (
                          <span 
                            onClick={() => onGoToFlightSchedule?.(row.flight)}
                            style={{ 
                              background: "#fff9db", 
                              border: "1px dashed #f59e0b", 
                              borderRadius: 4, 
                              padding: "2px 4px", 
                              color: "#b45309", 
                              fontWeight: 800, 
                              fontSize: "9px", 
                              marginLeft: "4px",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "2px",
                              cursor: onGoToFlightSchedule ? "pointer" : "help",
                              transition: "all 0.1s ease"
                            }}
                            title={`No flight scheduled for ${row.flight} on ${mismatchInfo.dayName} (${mismatchInfo.daysConfig}). Click to view or edit schedule.`}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "#fee2e2";
                              e.currentTarget.style.borderColor = "#ef4444";
                              e.currentTarget.style.color = "#991b1b";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "#fff9db";
                              e.currentTarget.style.borderColor = "#f59e0b";
                              e.currentTarget.style.color = "#b45309";
                            }}
                          >
                            ⚠️ No Sched
                          </span>
                        )}
                        <span 
                          onClick={() => setSelectedAirlineFlight(row.flight)}
                          style={{ 
                            background: "#e0f2fe", 
                            border: "1px solid #bae6fd", 
                            borderRadius: 4, 
                            padding: "2px 5px", 
                            color: "#0369a1", 
                            fontWeight: 800, 
                            fontSize: "9px", 
                            marginLeft: "4px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "2.5px",
                            cursor: "pointer",
                            transition: "all 0.1s ease"
                          }}
                          title="Click to view Saved Airline & Booking Information"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#bae6fd";
                            e.currentTarget.style.borderColor = "#0284c7";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "#e0f2fe";
                            e.currentTarget.style.borderColor = "#bae6fd";
                          }}
                        >
                          ✈️ Info
                        </span>
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        fontWeight: 600,
                        color: isDeletedOrSured ? "#ffffff" : (isComplete ? "#166534" : T.text),
                        maxWidth: 130,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontSize: 10.5,
                        textDecoration: isComplete ? "line-through" : "none",
                      }}
                    >
                      {row.shipper}
                    </td>
                    {/* ULD */}
                    <td style={{ padding: "4px 6px", width: 110, minWidth: 110 }}>
                      <textarea
                        value={row.uld || ""}
                        onChange={(e) => onUpdate?.(row.id, { uld: e.target.value.toUpperCase() })}
                        title="ULD Equipment (e.g. 1 X PMC, AKE). Click to edit/adjust manually"
                        rows={Math.max(2, (() => {
                          const val = row.uld || "";
                          const parts = val.split("\n");
                          let count = 0;
                          parts.forEach(p => {
                            count += Math.max(1, Math.ceil(p.length / 10));
                          });
                          return count;
                        })())}
                        style={{
                          width: "100%",
                          resize: "none",
                          background: isDeletedOrSured ? "#111111" : (dupDetails[row.id]?.some((d) => d.type === "ULD") ? "#fff7ed" : isComplete ? "#d1fae5" : "#ffffff"),
                          border: isDeletedOrSured ? "1.5px solid #52525b" : (dupDetails[row.id]?.some((d) => d.type === "ULD") ? "1.5px solid #f97316" : isComplete ? "1px solid #a7f3d0" : "1px solid #cbd5e1"),
                          borderRadius: 4,
                          padding: "6px 6px",
                          fontSize: 11,
                          color: isDeletedOrSured ? "#ffffff" : (dupDetails[row.id]?.some((d) => d.type === "ULD") ? "#b45309" : isComplete ? "#166534" : "#000000"),
                          fontFamily: "monospace",
                          fontWeight: 840,
                          outline: "none",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                          overflowWrap: "anywhere",
                          overflow: "hidden",
                          lineHeight: "1.3",
                          textDecoration: isComplete ? "line-through" : "none",
                        }}
                      />
                    </td>
                    <td style={{ padding: "8px 12px", fontWeight: 800, color: isDeletedOrSured ? "#ffffff" : (isComplete ? "#166534" : "#b45309"), textDecoration: isComplete ? "line-through" : "none" }}>{row.dest}</td>
                    <td style={{ padding: "8px 12px", color: isDeletedOrSured ? "#ffffff" : (isComplete ? "#166534" : T.textMid), fontSize: 11, whiteSpace: "nowrap", fontWeight: 600, textDecoration: isComplete ? "line-through" : "none" }}>
                      {row.ice && row.ice.trim() ? row.ice : "N/A"}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <span style={{ textDecoration: isComplete ? "line-through" : "none", display: "inline-block" }}>
                        <Pill text={row.commodity} color={isComplete ? "#16a34a" : isDeletedOrSured ? "#27272a" : cCol(row.commodity)} textColor={isDeletedOrSured ? "#ffffff" : undefined} />
                      </span>
                    </td>
                    <td style={{ padding: "8px 12px", color: isDeletedOrSured ? "#ffffff" : (isComplete ? "#166534" : T.text), fontSize: 11, fontWeight: 600, textDecoration: isComplete ? "line-through" : "none" }}>{row.cto}</td>
                    <td style={{ padding: "8px 12px", textDecoration: isComplete ? "line-through" : "none" }}>
                      <span style={{ fontWeight: 800, color: isDeletedOrSured ? "#ffffff" : (isComplete ? "#166534" : "#1e293b") }}>
                        {row.scr || "—"}
                      </span>
                    </td>
                    {/* LOAD TYPE (manually toggleable pill button) */}
                    <td style={{ padding: "4px 8px", whiteSpace: "nowrap", width: 100 }}>
                      <button
                        onClick={() => {
                          const nextType = (row.loadType || "UNIT").toUpperCase() === "LOOSE" ? "UNIT" : "LOOSE";
                          const sched = schedule[row.flight.toUpperCase()];
                          let nextCutoff = row.cutoff;
                          if (sched && sched.cutoff) {
                            nextCutoff = nextType === "LOOSE" ? (subtractHour(sched.cutoff) || sched.cutoff) : sched.cutoff;
                          }
                          onUpdate?.(row.id, { loadType: nextType, cutoff: nextCutoff });
                        }}
                        title="Click to toggle between UNIT and LOOSE"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "100%",
                          padding: "5px 8px",
                          fontSize: "11px",
                          fontWeight: 850,
                          fontFamily: "inherit",
                          borderRadius: "20px", // capsule pill button
                          cursor: "pointer",
                          transition: "all 0.1s ease",
                          textDecoration: isComplete ? "line-through" : "none",
                          border: "none",
                          background: (row.loadType || "UNIT").toUpperCase() === "LOOSE" ? "#fee2e2" : "#dbeafe",
                          color: (row.loadType || "UNIT").toUpperCase() === "LOOSE" ? "#991b1b" : "#1e40af",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                        }}
                      >
                        {(row.loadType || "UNIT").toUpperCase()}
                      </button>
                    </td>
                    <td style={{ padding: "8px 12px", color: isDeletedOrSured ? "#ffffff" : (isComplete ? "#166534" : T.textMid), fontSize: 11, fontWeight: 500, textDecoration: isComplete ? "line-through" : "none" }}>{row.operator || "—"}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <div style={{ display: "flex", gap: 4, flexWrap: "nowrap" }}>
                        <button
                          onClick={() => onJobSheet(row)}
                          title="Print Job Sheet envelope"
                          style={{
                            background: "#fffbeb",
                            border: "1px solid #fde68a",
                            color: "#b45309",
                            borderRadius: 6,
                            padding: "4px 8px",
                            cursor: "pointer",
                            fontSize: 10,
                            fontWeight: 800,
                            whiteSpace: "nowrap",
                          }}
                        >
                          📄 Job
                        </button>
                        <button
                          onClick={() => onLoadsheet(row)}
                          title="Open Load Out Sheet editor"
                          style={{
                            background: T.greenBg,
                            border: `1px solid #bbf7d0`,
                            color: "#166534",
                            borderRadius: 6,
                            padding: "4px 8px",
                            cursor: "pointer",
                            fontSize: 10,
                            fontWeight: 800,
                            whiteSpace: "nowrap",
                          }}
                        >
                          📋 Load
                        </button>

                        <button
                          onClick={() => onEdit(row)}
                          style={{
                            background: T.accentBg,
                            border: `1px solid ${T.border}`,
                            color: T.accent,
                            borderRadius: 6,
                            padding: "4px 8px",
                            cursor: "pointer",
                            fontSize: 10,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                          }}
                        >
                          Edit
                        </button>
                        <DeleteButton
                          id={row.id}
                          onDelete={onDelete}
                          onUpdate={onUpdate}
                          confirmDelete={row.confirmDelete}
                          deleteSured={row.deleteSured}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>
      ) : (
        <div
          style={{
            padding: "40px 20px",
            textAlign: "center",
            background: "#f8fafc",
            borderRadius: 12,
            border: "1px dashed #cbd5e1",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
          }}
        >
          <AlertCircle size={32} style={{ color: T.textMuted }} />
          <div>
            <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.text }}>No Filter Results Matched</h4>
            <p style={{ margin: "4px 0 0 0", fontSize: 11, color: T.textMuted }}>
              Adjust the date range or keyword search above to fetch archival manifests
            </p>
          </div>
        </div>
      )}

      {/* Range Email modal placement */}
      <RangeEmailModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        from={from}
        to={to}
        selectedShipments={results.filter((r) => selectedResultIds.has(r.id))}
        onTriggerExcel={exportRangeToExcel}
        onTriggerPdf={printRangeToPDF}
      />

      <AirlineInfoModal
        isOpen={selectedAirlineFlight !== null}
        flightCode={selectedAirlineFlight}
        schedule={schedule}
        onClose={() => setSelectedAirlineFlight(null)}
        onGoToFlightSchedule={onGoToFlightSchedule}
      />
    </div>
  );
};

