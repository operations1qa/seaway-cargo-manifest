/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { Shipment, FlightSchedule } from "../types";
import { T, cCol } from "../utils/theme";
import { toDisplay, todayStr, generateJobSheetHtml, subtractHour, getDayOfWeek, formatAwb, isUrgentShipment } from "../utils/helpers";
import { Pill } from "./UIAtoms";
import { AirlineInfoModal } from "./AirlineInfoModal";
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar, 
  Search, 
  X, 
  Printer, 
  Download, 
  FileSpreadsheet, 
  Upload, 
  FileText,
  BookOpen,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Info
} from "lucide-react";

interface ShipmentsTabProps {
  records: Shipment[];
  schedule: FlightSchedule;
  onEdit: (row: Shipment) => void;
  onDelete: (id: number) => void;
  onLoadsheet: (row: Shipment) => void;
  onJobSheet: (row: Shipment) => void;
  onToggleComplete: (id: number) => void;
  onImport: (newRows: Omit<Shipment, "id">[]) => void;
  onUpdate?: (id: number, fields: Partial<Shipment>) => void;
  selectedDate?: string;
  onSelectedDateChange?: (date: string) => void;
  onGoToFlightSchedule?: (flightCode: string) => void;
}

// Helper to deduce duplicate actual ULD numbers (e.g. PMC13511QF, AKE92169CX, etc.)
const isActualULD = (v: string): boolean => {
  if (!v || !v.trim()) return false;
  const cleaned = v.trim().toUpperCase();
  if (/\b(LOOSE|SKID|CTN|CTNS|CARTON|PCE|PAL|PALLET|BOX|PLT|WOODEN)\b/i.test(cleaned)) return false;
  if (/^\d+\s*[Xx]\s+/i.test(cleaned)) return false; // "2 X PMC" pattern
  return /[A-Z]{2,4}\d{4,}/.test(cleaned);
};

export const buildDuplicateSets = (records: Shipment[]) => {
  const awbCount: { [awb: string]: number[] } = {};
  const uldCount: { [uld: string]: number[] } = {};

  records.forEach((r) => {
    const awb = (r.awb || "").trim();
    if (awb) {
      awbCount[awb] = (awbCount[awb] || []).concat(r.id);
    }

    const uldStr = (r.unitNum || "").trim();
    if (uldStr) {
      uldStr.split(/[\s,/]+/).forEach((token) => {
        const t = token.trim().toUpperCase();
        if (t && isActualULD(t)) {
          uldCount[t] = (uldCount[t] || []).concat(r.id);
        }
      });
    }
  });

  const dupIds = new Set<number>();
  const dupDetails: { [id: number]: any[] } = {};

  // For looking up a record quickly by its ID
  const recordMap = new Map<number, Shipment>();
  records.forEach((r) => recordMap.set(r.id, r));

  Object.entries(awbCount).forEach(([awb, ids]) => {
    if (ids.length > 1) {
      const conflicts = ids.map((id) => {
        const item = recordMap.get(id);
        return {
          id,
          date: item ? item.date : "",
          flight: item ? item.flight : "",
          shipper: item ? item.shipper : "",
        };
      });

      ids.forEach((id) => {
        if (!dupDetails[id]) dupDetails[id] = [];
        dupDetails[id].push({
          type: "AWB",
          value: awb,
          count: ids.length,
          conflicts,
        });
        dupIds.add(id);
      });
    }
  });

  Object.entries(uldCount).forEach(([uld, ids]) => {
    if (ids.length > 1) {
      const conflicts = ids.map((id) => {
        const item = recordMap.get(id);
        return {
          id,
          date: item ? item.date : "",
          flight: item ? item.flight : "",
          shipper: item ? item.shipper : "",
        };
      });

      ids.forEach((id) => {
        if (!dupDetails[id]) dupDetails[id] = [];
        dupDetails[id].push({
          type: "ULD",
          value: uld,
          count: ids.length,
          conflicts,
        });
        dupIds.add(id);
      });
    }
  });

  return { dupIds, dupDetails };
};

const exportToExcel = (rows: Shipment[], filename: string) => {
  const headers = [
    "Date",
    "Cutoff",
    "AWB",
    "Flight",
    "Client",
    "Shipper",
    "ULD",
    "Destination",
    "Dry Ice",
    "CTO",
    "Commodity",
    "Special Instructions",
    "SCR",
    "Operator",
    "Load Type",
    "Job Ref",
    "Consol Ref",
    "ETA",
    "ETD",
    "Complete",
  ];
  
  const excelRows = [
    headers,
    ...rows.map((r) => [
      toDisplay(r.date),
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
      r.scr || "—",
      r.operator || "—",
      r.loadType || "—",
      r.jobRef || "",
      r.consolRef || "",
      r.eta || "",
      r.etd || "",
      r.complete ? "YES" : "NO",
    ]),
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
  
  const finalFilename = filename ? filename.replace(/\.csv$/i, ".xlsx") : "seaway_loadsheet.xlsx";
  a.download = finalFilename;
  a.click();
  URL.revokeObjectURL(url);
};

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
        fontSize: 11,
        fontWeight: (isSured || isConfirming) ? 900 : 500,
        whiteSpace: "nowrap",
        transition: "all 0.1s",
      }}
    >
      {buttonText}
    </button>
  );
};

export const ShipmentsTab: React.FC<ShipmentsTabProps> = ({
  records,
  schedule,
  onEdit,
  onDelete,
  onLoadsheet,
  onJobSheet,
  onToggleComplete,
  onImport,
  onUpdate,
  selectedDate,
  onSelectedDateChange,
  onGoToFlightSchedule,
}) => {
  const today = todayStr();
  const [localDate, setLocalDate] = useState(today);
  const selDate = selectedDate !== undefined ? selectedDate : localDate;
  const setSelDate = onSelectedDateChange !== undefined ? onSelectedDateChange : setLocalDate;
  const [search, setSearch] = useState("");
  const [selectedJobs, setSelectedJobs] = useState<Set<number>>(new Set());
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null);
  const [selectedAirlineFlight, setSelectedAirlineFlight] = useState<string | null>(null);
  const [highlightedRowId, setHighlightedRowId] = useState<number | null>(null);
  const [showOtherDaysDups, setShowOtherDaysDups] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const handleScrollToRow = (rowId: number) => {
    setHighlightedRowId(rowId);
    setTimeout(() => {
      const el = document.getElementById("shipment-row-" + rowId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);
    setTimeout(() => {
      setHighlightedRowId(null);
    }, 2500);
  };

  const handleGoToConflict = (conflictId: number, dateStr: string) => {
    if (selDate !== dateStr) {
      setSelDate(dateStr);
    }
    setTimeout(() => {
      handleScrollToRow(conflictId);
    }, 150);
  };
  
  // SOP / FAQ Guide state variables
  const [showSopGuide, setShowSopGuide] = useState(false);
  const [sopSubTab, setSopSubTab] = useState<"sop" | "faq">("sop");

  // Clear bulk print status and active delete highlights when selected date or search text changes
  React.useEffect(() => {
    setSelectedJobs(new Set());
    setConfirmingDeleteId(null);
  }, [selDate, search]);

  const allDates = useMemo(() => [...new Set(records.map((r) => r.date))].sort(), [records]);
  const { dupIds, dupDetails } = useMemo(() => buildDuplicateSets(records), [records]);

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

  const dayRecords = useMemo(() => {
    const q = search.toLowerCase();
    return records.filter((r) => {
      if (r.date !== selDate) return false;
      if (q) {
        const matchLine = [
          r.shipper, r.awb, r.flight, r.dest, r.commodity, r.cto, r.operator, r.unitNum, r.specialInst
        ].join(" ").toLowerCase();
        if (!matchLine.includes(q)) return false;
      }
      return true;
    });
  }, [records, selDate, search]);

  const [sk, setSk] = useState<keyof Shipment>("cutoff");
  const [sd, setSd] = useState<number>(1);

  const sortT = (k: keyof Shipment) => {
    if (sk === k) {
      setSd((d) => d * -1);
    } else {
      setSk(k);
      setSd(1);
    }
  };

  const finalSorted = useMemo(() => {
    return [...dayRecords].sort((a: any, b: any) => {
      if (sk === "cutoff" || sk === "date") {
        const av = parseInt((a[sk] || "0").replace(/\D/g, ""), 10) || 0;
        const bv = parseInt((b[sk] || "0").replace(/\D/g, ""), 10) || 0;
        return (av - bv) * sd;
      }
      return (a[sk] || "").toString().localeCompare((b[sk] || "").toString()) * sd;
    });
  }, [dayRecords, sk, sd]);

  const mismatchCount = useMemo(() => {
    return finalSorted.filter(row => !row.complete && getDayMismatchInfo(row.flight, row.date)).length;
  }, [finalSorted, schedule]);

  const TH = (k: keyof Shipment, lbl: string, w?: number) => (
    <th
      onClick={() => sortT(k)}
      style={{
        padding: "9px 10px",
        textAlign: "left",
        color: "#000000",
        fontWeight: 700,
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        cursor: "pointer",
        whiteSpace: "nowrap",
        width: w,
        userSelect: "none",
        background: sk === k ? T.accentBg : T.surface,
        borderBottom: `2px solid ${sk === k ? T.accent : T.border}`,
      }}
    >
      {lbl}
      {sk === k ? (sd === 1 ? " ↑" : " ↓") : ""}
    </th>
  );

  const toggleJobSelect = (id: number) => {
    setSelectedJobs((prev) => {
      const n = new Set(prev);
      if (n.has(id)) {
        n.delete(id);
      } else {
        n.add(id);
      }
      return n;
    });
  };

  const allSelected = finalSorted.length > 0 && finalSorted.every((r) => selectedJobs.has(r.id));
  
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedJobs((prev) => {
        const n = new Set(prev);
        finalSorted.forEach((r) => n.delete(r.id));
        return n;
      });
    } else {
      setSelectedJobs((prev) => {
        const n = new Set(prev);
        finalSorted.forEach((r) => n.add(r.id));
        return n;
      });
    }
  };

  const printSelectedJobSheets = () => {
    const rows = finalSorted.filter((r) => selectedJobs.has(r.id));
    if (rows.length === 0) {
      alert("No job sheets selected. Tick the checkboxes next to the AWB / ULD checkboxes first.");
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

  const downloadImportTemplate = () => {
    const headers = [
      "DATE(DDMMYYYY)*",
      "CUTOFF",
      "SHIPPER",
      "AWB*",
      "FLIGHT*",
      "CTO",
      "ULD",
      "ICE",
      "DEST",
      "COMMODITY",
      "SPECIALINST",
      "SCR",
      "OPERATOR",
      "LOADTYPE*"
    ];
    const example = [
      "13062026",
      "0900",
      "LACTALIS PNS",
      "081-61062035",
      "QF029",
      "QANTAS",
      "1 X PMC",
      "45",
      "HKG",
      "DAIRY",
      "FOIL / ICE / TEMP",
      "YES",
      "Mohamed",
      "UNIT"
    ];

    const worksheet = XLSX.utils.aoa_to_sheet([headers, example]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "ShipmentsTemplate");

    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shipment_import_template.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert worksheet to raw arrays of array (header: 1)
        const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
        if (rawRows.length < 2) {
          alert("File appears empty or has no data rows.");
          return;
        }
        
        const headers = rawRows[0].map((h) => String(h || "").trim().toLowerCase().replace(/\*/g, ""));
        const colIdx = (key: string) => headers.indexOf(key.toLowerCase().replace(/\*/g, ""));
        
        const getCell = (row: any[], key: string) => {
          const idx = colIdx(key);
          if (idx < 0 || row[idx] === undefined || row[idx] === null) return "";
          return String(row[idx]).trim();
        };

        const newRows: Omit<Shipment, "id">[] = [];
        let imported = 0;

        rawRows.slice(1).forEach((cleanRow) => {
          if (!cleanRow || cleanRow.length === 0) return;
          if (cleanRow.every(c => c === undefined || c === null || String(c).trim() === "")) return;
          
          const dateOrig = getCell(cleanRow, "date(ddmmyyyy)") || getCell(cleanRow, "date");
          const awb = getCell(cleanRow, "awb");
          if (!dateOrig && !awb) return;

          const flight = getCell(cleanRow, "flight").toUpperCase().trim();
          // Ensure it gets the data ONLY from the flight number and NOT the destination (dest)
          const schedInfo = schedule[flight] || Object.entries(schedule).find(([k]) => k.toUpperCase() === flight)?.[1];
          const loadType = (getCell(cleanRow, "loadtype") || "UNIT").toUpperCase();

          const isMissing = (val: string) => !val || val === "—" || val === "-" || val === "NONE";

          let cutoff = getCell(cleanRow, "cutoff").toUpperCase();
          if (isMissing(cutoff) && schedInfo) {
            cutoff = loadType === "LOOSE" ? (subtractHour(schedInfo.cutoff) || schedInfo.cutoff) : schedInfo.cutoff;
          }

          let cto = getCell(cleanRow, "cto").toUpperCase();
          if (isMissing(cto) && schedInfo) {
            cto = schedInfo.cto.toUpperCase();
          } else if (isMissing(cto)) {
            cto = "QANTAS";
          }

          let dest = getCell(cleanRow, "dest").toUpperCase();
          if (isMissing(dest) && schedInfo) {
            dest = schedInfo.dest.toUpperCase();
          }

          let eta = getCell(cleanRow, "eta").toUpperCase();
          if (isMissing(eta) && schedInfo) {
            eta = schedInfo.eta.toUpperCase();
          }

          let etd = getCell(cleanRow, "etd").toUpperCase();
          if (isMissing(etd) && schedInfo) {
            etd = schedInfo.etd.toUpperCase();
          }

          newRows.push({
            date: dateOrig.replace(/\D/g, "").slice(0, 8),
            cutoff: cutoff,
            shipper: getCell(cleanRow, "shipper").toUpperCase(),
            awb: formatAwb(awb.toUpperCase()),
            flight: flight,
            cto: cto,
            uld: getCell(cleanRow, "uld").toUpperCase(),
            unitNum: (getCell(cleanRow, "unitnum") || getCell(cleanRow, "unit num") || getCell(cleanRow, "unit_num") || "").toUpperCase(),
            ice: getCell(cleanRow, "ice").toUpperCase(),
            dest: dest,
            commodity: getCell(cleanRow, "commodity").toUpperCase(),
            specialInst: (getCell(cleanRow, "specialinst") || getCell(cleanRow, "special instructions") || getCell(cleanRow, "instructions") || "").toUpperCase(),
            scr: (getCell(cleanRow, "scr") || "YES").toUpperCase(),
            operator: getCell(cleanRow, "operator").toUpperCase(),
            loadType: loadType,
            jobRef: (getCell(cleanRow, "jobref") || getCell(cleanRow, "job ref") || "").toUpperCase(),
            consolRef: (getCell(cleanRow, "consolref") || getCell(cleanRow, "consol ref") || "").toUpperCase(),
            eta: eta,
            etd: etd,
            complete: false,
          });
          imported++;
        });

        if (newRows.length === 0) {
          alert("No valid rows found in the file. Check the format matches the template.");
          return;
        }

        onImport(newRows);
        alert(`✓ Successfully imported ${imported} shipment${imported !== 1 ? "s" : ""}!`);
      } catch (err: any) {
        alert("Import failed: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ""; // Reset
  };

  const printManifestToPDF = () => {
    if (dayRecords.length === 0) {
      alert("No cargo records to list in the manifest for the selected date.");
      return;
    }

    const win = window.open("", "_blank", "width=1200,height=800");
    if (!win) return;

    const formattedDate = toDisplay(selDate);
    const dayOfWeek = getDayOfWeek(selDate);

    const tableRowsHtml = finalSorted.map((r, i) => {
      const hasUld = r.unitNum && r.unitNum !== "—" && r.unitNum.trim() !== "";
      const uldNumberDisplay = hasUld ? r.unitNum : "";

      return `
        <tr style="background: #ffffff; border-bottom: 2px solid #94a3b8;">
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

    const totalLoads = finalSorted.length;
    const checkedLoads = finalSorted.filter((r) => r.complete).length;
    const pendingLoads = totalLoads - checkedLoads;

    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>SEAWAY_${selDate}</title>
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
              <div class="date-title">${formattedDate}</div>
              <div class="date-day">${dayOfWeek.toUpperCase()}</div>
            </div>
          </div>

          <div class="stats-bar">
            <div>MANIFEST SUMMARY:</div>
            <div class="stat-pill">TOTAL SHIPMENTS: ${totalLoads}</div>
            <div class="stat-pill" style="color: #166534; background: #f0fdf4;">CHECKED OFF: ${checkedLoads}</div>
            <div class="stat-pill" style="color: #b45309; background: #fffbeb;">PENDING OPERATIONAL SIGN-OFF: ${pendingLoads}</div>
          </div>

          <table>
            <thead>
              <tr style="background: #f1f5f9;">
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

  const handleExport = () => {
    exportToExcel(dayRecords, `seaway_${toDisplay(selDate).replace(/\//g, "-")}.xlsx`);
  };

  const prevDate = useMemo(() => {
    if (!selDate || selDate.length !== 8) return null;
    const day = parseInt(selDate.slice(0, 2), 10);
    const month = parseInt(selDate.slice(2, 4), 10) - 1;
    const year = parseInt(selDate.slice(4), 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    const d = new Date(year, month, day - 1);
    const dy = String(d.getDate()).padStart(2, "0");
    const mn = String(d.getMonth() + 1).padStart(2, "0");
    const yr = String(d.getFullYear());
    return `${dy}${mn}${yr}`;
  }, [selDate]);

  const nextDate = useMemo(() => {
    if (!selDate || selDate.length !== 8) return null;
    const day = parseInt(selDate.slice(0, 2), 10);
    const month = parseInt(selDate.slice(2, 4), 10) - 1;
    const year = parseInt(selDate.slice(4), 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    const d = new Date(year, month, day + 1);
    const dy = String(d.getDate()).padStart(2, "0");
    const mn = String(d.getMonth() + 1).padStart(2, "0");
    const yr = String(d.getFullYear());
    return `${dy}${mn}${yr}`;
  }, [selDate]);

  const completedCount = dayRecords.filter((r) => r.complete).length;
  const dupCount = dayRecords.filter((r) => dupIds.has(r.id)).length;
  const otherDaysDupCount = useMemo(() => {
    return records.filter((r) => r.date !== selDate && dupIds.has(r.id)).length;
  }, [records, selDate, dupIds]);
  const selectedCount = finalSorted.filter((r) => selectedJobs.has(r.id)).length;
  const urgentCount = useMemo(() => {
    return dayRecords.filter((r) => isUrgentShipment(r)).length;
  }, [dayRecords]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Redesigned Search & Navigation Control Hub */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: 20,
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 14,
          }}
        >
          {/* Left: Date Switcher & Segmented Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => setSelDate(todayStr())}
              style={{
                background: selDate === todayStr() ? "#000000" : "#ffffff",
                border: `1px solid ${selDate === todayStr() ? "#000000" : "#d2d2d7"}`,
                color: selDate === todayStr() ? "#ffffff" : T.text,
                borderRadius: 24,
                padding: "8px 16px",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
                transition: "all 0.15s",
              }}
            >
              Today
            </button>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "#f5f5f7",
                border: "1px solid #e5e7eb",
                borderRadius: 28,
                padding: "3px",
                boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                position: "relative",
              }}
            >
              <button
                onClick={() => prevDate && setSelDate(prevDate)}
                disabled={!prevDate}
                title="Previous Day"
                style={{
                  background: "transparent",
                  border: "none",
                  color: prevDate ? T.text : T.textMuted,
                  borderRadius: "50%",
                  width: 40,
                  height: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: prevDate ? "pointer" : "default",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (prevDate) e.currentTarget.style.background = "rgba(0,0,0,0.04)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <ChevronLeft size={22} style={{ strokeWidth: 2.2 }} />
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 14px", color: T.text, position: "relative" }}>
                <Calendar size={18} style={{ color: T.textMuted }} />
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: "1.15" }}>
                  <span style={{ fontSize: 9.5, fontWeight: 750, textTransform: "uppercase", color: T.textMuted, letterSpacing: "0.06em" }}>
                    {selDate ? getDayOfWeek(selDate) : "—"}
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 900, color: "#000000", letterSpacing: "-0.01em" }}>
                    {selDate ? toDisplay(selDate) : "—"}
                  </span>
                </div>
                <input
                  type="date"
                  value={selDate.length === 8 ? `${selDate.slice(4)}-${selDate.slice(2, 4)}-${selDate.slice(0, 2)}` : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) {
                      const d = v.split("-");
                      setSelDate(d[2] + d[1] + d[0]);
                    }
                  }}
                  style={{
                    opacity: 0,
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    cursor: "pointer",
                  }}
                />
              </div>

              <button
                onClick={() => nextDate && setSelDate(nextDate)}
                disabled={!nextDate}
                title="Next Day"
                style={{
                  background: "transparent",
                  border: "none",
                  color: nextDate ? T.text : T.textMuted,
                  borderRadius: "50%",
                  width: 40,
                  height: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: nextDate ? "pointer" : "default",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (nextDate) e.currentTarget.style.background = "rgba(0,0,0,0.04)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <ChevronRight size={22} style={{ strokeWidth: 2.2 }} />
              </button>
            </div>

            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: T.textMuted,
                background: "#f5f5f7",
                padding: "6px 12px",
                borderRadius: 16,
                letterSpacing: "0.5px",
                textTransform: "uppercase",
              }}
            >
              {dayRecords.length} Shipment{dayRecords.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Right side: Modern Unified Search Field */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "1 1 320px", maxWidth: 450, minWidth: 260 }}>
            <div
              style={{
                position: "relative",
                flex: 1,
                display: "flex",
                alignItems: "center",
                background: "#f5f5f7",
                border: "1px solid #d2d2d7",
                borderRadius: 24,
                padding: "0 14px",
                transition: "border-color 0.2s, box-shadow 0.2s, background 0.2s",
              }}
            >
              <Search size={14} style={{ color: T.textMuted, marginRight: 8, flexShrink: 0 }} />
              <input
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "6px 0",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: T.text,
                  width: "100%",
                  textTransform: "uppercase",
                  outline: "none",
                  height: 36,
                }}
                value={search}
                onChange={(e) => setSearch(e.target.value.toUpperCase())}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  title="Clear search"
                  style={{
                    background: "#e5e7eb",
                    border: "none",
                    borderRadius: "50%",
                    width: 18,
                    height: 18,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    position: "absolute",
                    right: 12,
                    color: T.textMid,
                  }}
                >
                  <X size={10} style={{ strokeWidth: 3 }} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Action Button Row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
            borderTop: "1px dashed #e5e7eb",
            paddingTop: 12,
          }}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          </div>

          {/* Import / Template section */}
          <div style={{ display: "flex", background: "#f3f4f6", borderRadius: 20, padding: 2, border: "1px solid #e5e7eb" }}>
            <button
              onClick={downloadImportTemplate}
              title="Download Excel template for import"
              style={{
                background: "transparent",
                border: "none",
                color: T.textMid,
                borderRadius: "20px 0 0 20px",
                padding: "6px 14px",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Download size={12} />
              <span>Template Download</span>
            </button>
            <div style={{ width: 1, background: "#d2d2d7", margin: "4px 0" }}></div>
            <button
              onClick={() => importRef.current?.click()}
              style={{
                background: "transparent",
                border: "none",
                color: T.accent,
                borderRadius: "0 20px 20px 0",
                padding: "6px 14px",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Upload size={12} />
              <span>Import Jobs</span>
            </button>
            <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleImportFile} />
          </div>
        </div>
      </div>



      {/* Duplicate panel warning mapping */}
      {(dupCount > 0 || otherDaysDupCount > 0) && (
        <div style={{ background: T.amberBg, border: `1px solid ${T.amber}44`, borderRadius: 16, padding: "14px 20px", boxShadow: "0 8px 24px rgba(0,0,0,0.03)", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: "#b45309", fontSize: 13, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>⚠️ Duplicate Airway Bill (AWB) or Container ULD Collisions Detected in System:</span>
            <span style={{ fontSize: 11, background: T.amber, color: "#ffffff", padding: "2px 8px", borderRadius: 10 }}>
              {dupCount + otherDaysDupCount} total collisions
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* 1. CURRENT DAY DUPLICATES */}
            {dupCount > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#4b5563", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  📅 Duplicates on Selected Day ({toDisplay(selDate)}):
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {dayRecords
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
                        title="Click to automatically scroll and highlight this shipment"
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
                              <span
                                key={cidx}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleGoToConflict(c.id, c.date);
                                }}
                                style={{
                                  background: c.date === selDate ? T.amberBg : "#f3f4f6",
                                  border: `1px solid ${c.date === selDate ? T.amber : "#e5e7eb"}`,
                                  borderRadius: "12px",
                                  padding: "2px 8px",
                                  color: "#000000",
                                  fontWeight: 700,
                                  fontSize: "10px",
                                  cursor: "pointer"
                                }}
                                title={`Click to navigate to ${toDisplay(c.date)} and highlight this duplicate record`}
                              >
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

            {/* 2. OTHER DAYS DUPLICATES SECTION */}
            {otherDaysDupCount > 0 && (
              <div style={{ borderTop: "1px dashed rgba(0,0,0,0.08)", paddingTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    🔄 Duplicates Found on Other Dates ({otherDaysDupCount} records):
                  </div>
                  <button
                    onClick={() => setShowOtherDaysDups(!showOtherDaysDups)}
                    style={{
                      background: "none",
                      border: "none",
                      color: T.accent,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      textDecoration: "underline",
                      padding: "2px 6px"
                    }}
                  >
                    {showOtherDaysDups ? "Collapse List" : "Expand list & view all"}
                  </button>
                </div>

                {showOtherDaysDups && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {records
                      .filter((r) => r.date !== selDate && dupIds.has(r.id))
                      .map((r) => (
                        <div
                          key={r.id}
                          onClick={() => handleGoToConflict(r.id, r.date)}
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
                          title={`Click to automatically jump to date ${toDisplay(r.date)} and highlight this shipment`}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 10, background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 6, padding: "2px 6px", fontWeight: "bold" }}>
                              📅 {toDisplay(r.date)}
                            </span>
                            <strong style={{ color: "#000000" }}>{r.shipper} (Flight {r.flight})</strong>
                          </div>
                          {dupDetails[r.id]?.map((d, idx) => (
                            <div key={idx} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", fontSize: "11px" }}>
                              <span style={{ background: T.amberBg, borderRadius: 12, padding: "3px 10px", color: "#b45309", fontWeight: 700 }}>
                                {d.type}: <strong>{d.value}</strong>
                              </span>
                              <span style={{ color: "#4b5563", fontWeight: 500 }}>
                                {d.count}× entries detected on:
                              </span>
                              {d.conflicts?.map((c: any, cidx: number) => (
                                <span
                                  key={cidx}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleGoToConflict(c.id, c.date);
                                  }}
                                  style={{
                                    background: c.date === selDate ? T.amberBg : "#f3f4f6",
                                    border: `1px solid ${c.date === selDate ? T.amber : "#e5e7eb"}`,
                                    borderRadius: "12px",
                                    padding: "2px 8px",
                                    color: "#000000",
                                    fontWeight: 700,
                                    fontSize: "10px",
                                    cursor: "pointer"
                                  }}
                                  title={`Click to navigate to ${toDisplay(c.date)} and highlight this duplicate record`}
                                >
                                  📅 {toDisplay(c.date)} ({c.flight})
                                </span>
                              ))}
                            </div>
                          ))}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2 hours prior to cutoff warning mapping */}
      {urgentCount > 0 && (
        <div style={{ background: T.redBg, border: `1px solid ${T.red}44`, borderRadius: 16, padding: "14px 20px", boxShadow: "0 8px 24px rgba(0,0,0,0.03)", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: T.red, fontSize: 13, marginBottom: 8 }}>
            ⏰ 2H Cutoff Alert: {urgentCount} shipment{urgentCount !== 1 ? "s" : ""} approaching or past cutoff (within 2 hours) and NOT completed:
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {dayRecords
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
                  title="Click to automatically scroll to this shipment record in the table"
                >
                  <div>
                    <strong style={{ color: "#000000" }}>{r.shipper} (Flight {r.flight})</strong>
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

      {/* Flight Schedule Day Mismatch warning banner */}
      {mismatchCount > 0 && (
        <div
          style={{
            background: "#fffbeb",
            border: "1px dashed #f59e0b",
            color: "#b45309",
            padding: "12px 16px",
            borderRadius: "16px",
            fontSize: "12.5px",
            fontWeight: "bold",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            lineHeight: "1.4",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)"
          }}
        >
          <span style={{ fontSize: "16px" }}>⚠️</span>
          <div>
            <strong>Flight Day Schedule Conflict Alert:</strong> There are <strong>{mismatchCount} shipment(s)</strong> listed on this manifest page that fall on a day of the week with no scheduled operations. Check indicator badges in list below.
          </div>
        </div>
      )}

      {/* Shipment Manifest Grid */}
      <div style={{ background: T.surface, border: "1px solid #e5e7eb", borderRadius: 16, overflow: "hidden", boxShadow: "0 10px 30px rgba(0,0,0,0.03)" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textTransform: "uppercase" }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
              <tr>
                <th style={{ padding: "9px 10px", color: "#000000", fontSize: 10, background: T.surface, borderBottom: `2px solid ${T.border}`, whiteSpace: "nowrap", width: 44, textAlign: "center" }}>✓ Complete</th>
                {TH("cutoff", "CUTOFF", 62)}
                {TH("awb", "AWB", 145)}
                {TH("flight", "FLIGHT", 66)}
                <th style={{ padding: "9px 10px", textAlign: "left", color: "#000000", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap", width: 90, background: T.surface, borderBottom: `2px solid ${T.border}` }}>CLIENT</th>
                {TH("shipper", "SHIPPER", 150)}
                {TH("uld", "ULD", 110)}
                {TH("dest", "DEST", 52)}
                {TH("ice", "DRY ICE", 82)}
                {TH("cto", "CTO", 80)}
                {TH("commodity", "COMMODITY", 118)}
                {TH("specialInst", "INSTRUCTIONS", 160)}
                {TH("scr", "SCR", 44)}
                {TH("loadType", "LOAD TYPE", 100)}
                {TH("operator", "OPERATOR", 88)}
                <th style={{ padding: "9px 10px", color: "#000000", fontSize: 10, background: T.surface, borderBottom: `2px solid ${T.border}`, whiteSpace: "nowrap", width: 250 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {finalSorted.map((row, i) => {
                const isComplete = !!row.complete;
                const isDup = dupIds.has(row.id);
                const isJobSelected = selectedJobs.has(row.id);
                const mismatchInfo = !isComplete ? getDayMismatchInfo(row.flight, row.date) : null;
                const isConfirmingDelete = !!row.confirmDelete;
                const isSuredDelete = !!row.deleteSured;
                const isDeleting = !!row.isDeleted;
                const isDeletedOrSured = isDeleting || isSuredDelete;
                const isUrgent = isUrgentShipment(row);

                let rowBg = i % 2 === 0 ? T.surface : T.surface2;
                if (row.id === highlightedRowId) rowBg = "#fde047"; // High-visibility bright yellow-300 highlight
                else if (isComplete) rowBg = "#d1fae5";
                else if (isUrgent) rowBg = "#fee2e2";
                else if (isDup && !isComplete) rowBg = "#fff7ed";
                else if (mismatchInfo) rowBg = "#fffdf5";
                else if (isJobSelected) rowBg = "#fffbeb";
                if (isDeletedOrSured && row.id !== highlightedRowId) rowBg = "#000000"; // Black background for the marked/delete stage

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
                                    : isJobSelected 
                                      ? "#fef9c3" 
                                      : T.accentBg)));

                return (
                  <tr
                    id={"shipment-row-" + row.id}
                    key={row.id}
                    style={{
                      borderBottom: `1px solid ${row.id === highlightedRowId ? "#eab308" : (isDeletedOrSured ? "#3f3f46" : (isComplete ? "#bbf7d0" : isUrgent ? "#fca5a5" : isDup ? "#fed7aa" : mismatchInfo ? "#fef3c7" : isJobSelected ? "#fde68a" : T.border))}`,
                      background: rowBg,
                      transition: "background 0.4s ease, border-color 0.4s ease",
                      opacity: isComplete ? 0.75 : 1,
                      outline: row.id === highlightedRowId ? "3px solid #eab308" : "none",
                      outlineOffset: "-3px",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = hoverBg)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = rowBg)}
                  >
                    {/* Tick Checkbox Complete */}
                    <td style={{ padding: "8px 6px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={isComplete}
                        onChange={() => onToggleComplete(row.id)}
                        style={{ width: 16, height: 16, cursor: "pointer", accentColor: T.green }}
                        title={isComplete ? "Mark incomplete" : "Mark completed"}
                      />
                    </td>

                    {/* CUTOFF */}
                    <td style={{ 
                      padding: "8px 10px", 
                      color: isDeletedOrSured ? "#ffffff" : isComplete ? "#166534" : isUrgent ? "#991b1b" : "#000000", 
                      fontFamily: "monospace", 
                      fontWeight: 800, 
                      fontSize: 13, 
                      whiteSpace: "nowrap", 
                      textDecoration: isComplete ? "line-through" : "none" 
                    }}>
                      {row.cutoff || "—"}
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

                    {/* AWB */}
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                      {isDup ? (
                        <span style={{ background: isDeletedOrSured ? "#18181b" : "#fff7ed", border: isDeletedOrSured ? "1px solid #71717a" : "1px solid #f97316", borderRadius: 4, padding: "2px 8px", color: isDeletedOrSured ? "#ffffff" : (isComplete ? "#166534" : "#000000"), fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 14, fontFamily: "monospace", textDecoration: isComplete ? "line-through" : "none" }} title="Duplicate collision alerts screen. Check logs.">
                          ⚠ {row.awb}
                        </span>
                      ) : (
                        <span style={{ color: isDeletedOrSured ? "#ffffff" : (isComplete ? "#166534" : "#000000"), fontSize: 14, fontWeight: 800, fontFamily: "monospace", textDecoration: isComplete ? "line-through" : "none" }}>{row.awb}</span>
                      )}
                    </td>

                    {/* FLIGHT */}
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                      <span style={{ textDecoration: isComplete ? "line-through" : "none", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <span
                          onClick={() => onGoToFlightSchedule?.(row.flight)}
                          style={{ cursor: onGoToFlightSchedule ? "pointer" : "default" }}
                          title={onGoToFlightSchedule ? "Click to view flight details in Flight Admin" : undefined}
                        >
                          <Pill text={row.flight} color={isComplete ? "#16a34a" : (isDeletedOrSured ? "#27272a" : T.accent)} textColor={isDeletedOrSured ? "#ffffff" : undefined} />
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

                    {/* CLIENT */}
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                      <span style={{ background: isDeletedOrSured ? "#18181b" : "#f5f5f7", color: isDeletedOrSured ? "#ffffff" : (isComplete ? "#166534" : "#000000"), border: isDeletedOrSured ? "1px solid #52525b" : "1px solid #d2d2d7", borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", textDecoration: isComplete ? "line-through" : "none" }}>SEAWAY</span>
                    </td>

                    {/* SHIPPER */}
                    <td style={{ padding: "8px 10px", color: isDeletedOrSured ? "#ffffff" : (isComplete ? "#166534" : "#000000"), fontWeight: 600, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: isComplete ? "line-through" : "none" }}>
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
                          fontWeight: 855,
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

                    {/* DEST */}
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap", textDecoration: isComplete ? "line-through" : "none" }}>
                      <span style={{ fontWeight: 800, color: isDeletedOrSured ? "#ffffff" : (isComplete ? "#166534" : "#000000"), fontSize: 13 }}>{row.dest || "—"}</span>
                    </td>

                    {/* DRY ICE */}
                    <td style={{ padding: "8px 10px", color: isDeletedOrSured ? "#ffffff" : (isComplete ? "#166534" : "#000000"), fontSize: 11, whiteSpace: "nowrap", textDecoration: isComplete ? "line-through" : "none" }}>
                      {row.ice && row.ice.trim() ? row.ice : "N/A"}
                    </td>

                    {/* CTO */}
                    <td style={{ padding: "8px 10px", color: isDeletedOrSured ? "#ffffff" : (isComplete ? "#166534" : "#000000"), fontSize: 11, whiteSpace: "nowrap", textDecoration: isComplete ? "line-through" : "none" }}>
                      {row.cto || "—"}
                    </td>

                    {/* COMMODITY */}
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                      <span style={{ textDecoration: isComplete ? "line-through" : "none", display: "inline-block" }}>
                        <Pill text={row.commodity} color={isComplete ? "#16a34a" : isDeletedOrSured ? "#27272a" : cCol(row.commodity)} textColor={isDeletedOrSured ? "#ffffff" : undefined} />
                      </span>
                    </td>

                    {/* INSTRUCTIONS */}
                    <td style={{ padding: "8px 10px", color: isDeletedOrSured ? "#e2e8f0" : (isComplete ? "#166534" : "#000000"), fontSize: 11, minWidth: 160, whiteSpace: "normal", wordBreak: "break-word", textDecoration: isComplete ? "line-through" : "none" }} title={row.specialInst}>
                      {row.specialInst || "—"}
                    </td>

                    {/* SCR */}
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap", textDecoration: isComplete ? "line-through" : "none" }}>
                      <span style={{ fontWeight: 700, color: isDeletedOrSured ? "#ffffff" : (isComplete ? "#166534" : "#000000") }}>
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
                          fontWeight: 855,
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

                    {/* OPERATOR (editable inline input) */}
                    <td style={{ padding: "4px 8px", whiteSpace: "nowrap", width: 110 }}>
                      <input
                        type="text"
                        value={row.operator || ""}
                        onChange={(e) => onUpdate?.(row.id, { operator: e.target.value.toUpperCase() })}
                        placeholder="—"
                        title="Operator. Click to edit/adjust"
                        style={{
                          width: "100%",
                          background: isDeletedOrSured ? "#111111" : (isComplete ? "#d1fae5" : "#ffffff"),
                          border: isDeletedOrSured ? "1.5px solid #52525b" : (isComplete ? "1px solid #a7f3d0" : "1px solid #d2d2d7"),
                          borderRadius: 4,
                          padding: "4px 8px",
                          fontSize: 11,
                          color: isDeletedOrSured ? "#ffffff" : (isComplete ? "#166534" : "#000000"),
                          fontFamily: "monospace",
                          fontWeight: 800,
                          outline: "none",
                          textAlign: "center",
                          textDecoration: isComplete ? "line-through" : "none",
                        }}
                      />
                    </td>

                    {/* ACTIONS BUTTONS */}
                    <td style={{ padding: "8px 10px" }}>
                      <div style={{ display: "flex", gap: 3, flexWrap: "nowrap" }}>
                        <button onClick={() => onJobSheet(row)} title="Open Job Sheet editor" style={{ background: "#fef3c7", border: "1px solid #fde68a", color: "#000000", borderRadius: 4, padding: "3px 6px", cursor: "pointer", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>📄 Job</button>
                        <button onClick={() => onLoadsheet(row)} title="Open Load Out Sheet editor" style={{ background: T.greenBg, border: `1px solid #bbf7d0`, color: "#000000", borderRadius: 4, padding: "3px 6px", cursor: "pointer", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>📋 Load</button>
                        <button onClick={() => onEdit(row)} style={{ background: T.accentBg, border: `1px solid #bfdbfe`, color: "#000000", borderRadius: 4, padding: "3px 6px", cursor: "pointer", fontSize: 11, whiteSpace: "nowrap" }}>Edit</button>
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
          {finalSorted.length === 0 && (
            <div style={{ textAlign: "center", padding: 50, color: T.textMuted }}>
              No shipments matching records. Add high-risk loads or run spreadsheet imports.
            </div>
          )}
        </div>
      </div>

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
