/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { Shipment, FlightSchedule } from "../types";
import { T, cCol } from "../utils/theme";
import { toDisplay, todayStr, generateJobSheetHtml, subtractHour, getDayOfWeek, formatAwb } from "../utils/helpers";
import { Pill } from "./UIAtoms";
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

const DeleteButton: React.FC<{ onDelete: (id: number) => void; id: number }> = ({ onDelete, id }) => {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<any>(null);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirming) {
      onDelete(id);
      setConfirming(false);
      if (timerRef.current) clearTimeout(timerRef.current);
    } else {
      setConfirming(true);
      timerRef.current = setTimeout(() => {
        setConfirming(false);
      }, 3000);
    }
  };

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <button
      onClick={handleClick}
      title={confirming ? "Click again to confirm deletion" : "Delete load record"}
      style={{
        background: confirming ? "#fee2e2" : T.redBg,
        border: `1px solid ${confirming ? "#ef4444" : "#fecaca"}`,
        color: "#000000",
        borderRadius: 4,
        padding: "3px 6px",
        cursor: "pointer",
        fontSize: 11,
        fontWeight: confirming ? 800 : 500,
        whiteSpace: "nowrap",
        transition: "all 0.1s",
      }}
    >
      {confirming ? "Sure?" : "Del"}
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
}) => {
  const today = todayStr();
  const [localDate, setLocalDate] = useState(today);
  const selDate = selectedDate !== undefined ? selectedDate : localDate;
  const setSelDate = onSelectedDateChange !== undefined ? onSelectedDateChange : setLocalDate;
  const [search, setSearch] = useState("");
  const [selectedJobs, setSelectedJobs] = useState<Set<number>>(new Set());
  const importRef = useRef<HTMLInputElement>(null);
  
  // SOP / FAQ Guide state variables
  const [showSopGuide, setShowSopGuide] = useState(false);
  const [sopSubTab, setSopSubTab] = useState<"sop" | "faq">("sop");

  // Clear bulk print selections when selected date or search text changes
  React.useEffect(() => {
    setSelectedJobs(new Set());
  }, [selDate, search]);

  const allDates = useMemo(() => [...new Set(records.map((r) => r.date))].sort(), [records]);
  const { dupIds, dupDetails } = useMemo(() => buildDuplicateSets(records), [records]);

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
      "date(ddmmyyyy)",
      "cutoff",
      "shipper",
      "awb",
      "flight",
      "cto",
      "uld",
      "unitNum",
      "ice",
      "dest",
      "commodity",
      "specialInst",
      "scr",
      "operator",
      "loadType",
      "jobRef",
      "consolRef",
    ];
    const example = [
      "13062026",
      "0900",
      "LACTALIS PNS",
      "081-61062035",
      "QF029",
      "QANTAS",
      "1 X PMC",
      "PMC13511QF",
      "45",
      "HKG",
      "DAIRY",
      "FOIL / ICE / TEMP",
      "YES",
      "Mohamed",
      "UNIT",
      "JR001",
      "CR001",
    ];
    const csv = [headers, example].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "seaway_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length < 2) {
          alert("File appears empty or has no data rows.");
          return;
        }
        
        const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
        const colIdx = (key: string) => headers.indexOf(key);
        
        const getCell = (row: string[], key: string) => {
          const idx = colIdx(key);
          if (idx < 0) return "";
          return (row[idx] || "").trim().replace(/^"|"$/g, "");
        };

        const newRows: Omit<Shipment, "id">[] = [];
        let imported = 0;

        lines.slice(1).forEach((line) => {
          if (!line.trim()) return;
          
          // Split on comma except when commas are inside double quotes
          const row = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) || line.split(",");
          const cleanRow = row.map((val) => val.trim());
          
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
    reader.readAsText(file);
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
  const selectedCount = finalSorted.filter((r) => selectedJobs.has(r.id)).length;

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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "#f5f5f7",
                border: "1px solid #e5e7eb",
                borderRadius: 24,
                padding: "2px",
                boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
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
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: prevDate ? "pointer" : "default",
                }}
              >
                <ChevronLeft size={16} />
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 10px", color: T.text }}>
                <Calendar size={14} style={{ color: T.textMuted }} />
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
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 700,
                    color: T.text,
                    outline: "none",
                    padding: "2px 0",
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
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: nextDate ? "pointer" : "default",
                }}
              >
                <ChevronRight size={16} />
              </button>
            </div>

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
            {/* Print selected job sheets */}
            <button
              onClick={printSelectedJobSheets}
              disabled={selectedCount === 0}
              title={selectedCount === 0 ? "Tick checkboxes in shipment list first to select" : "Print selected job sheets"}
              style={{
                background: selectedCount > 0 ? T.amberBg : "#f5f5f7",
                border: `1px solid ${selectedCount > 0 ? T.amber : "#e5e7eb"}`,
                color: selectedCount > 0 ? "#b45309" : T.textMuted,
                borderRadius: 20,
                padding: "8px 16px",
                cursor: selectedCount > 0 ? "pointer" : "default",
                fontSize: 12,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.15s",
              }}
            >
              <Printer size={13} />
              <span>Bulk Print Job Sheets {selectedCount > 0 ? `(${selectedCount})` : ""}</span>
            </button>

            {/* Print manifest PDF button */}
            <button
              onClick={printManifestToPDF}
              disabled={dayRecords.length === 0}
              title="Print standard, high-contrast landscape PDF Manifest for external sharing"
              style={{
                background: dayRecords.length > 0 ? "#ecfeff" : "#f5f5f7",
                border: `1px solid ${dayRecords.length > 0 ? "#a5f3fc" : "#e5e7eb"}`,
                color: dayRecords.length > 0 ? "#0891b2" : T.textMuted,
                borderRadius: 20,
                padding: "8px 16px",
                cursor: dayRecords.length > 0 ? "pointer" : "default",
                fontSize: 12,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.15s",
              }}
            >
              <FileText size={13} />
              <span>Print to PDF</span>
            </button>
          </div>

          {/* Import / Template section */}
          <div style={{ display: "flex", background: "#f3f4f6", borderRadius: 20, padding: 2, border: "1px solid #e5e7eb" }}>
            <button
              onClick={downloadImportTemplate}
              title="Download empty CSV template for import"
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
              <span>Template</span>
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
            <input ref={importRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={handleImportFile} />
          </div>
        </div>
      </div>

      {/* Day header bar */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          boxShadow: "0 8px 24px rgba(0,0,0,0.03)",
        }}
      >
        <span style={{ color: T.accent, fontWeight: 800, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <span>📅 {toDisplay(selDate) || "No date selected"}</span>
          {selDate && (
            <span style={{ background: T.accentBg, color: T.accent, fontSize: 11, fontWeight: 800, padding: "2px 10px", borderRadius: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              {getDayOfWeek(selDate)}
            </span>
          )}
        </span>
        <span style={{ color: T.textMid, fontSize: 12, fontWeight: 500 }}>
          {finalSorted.length} shipment{finalSorted.length !== 1 ? "s" : ""}
        </span>
        {completedCount > 0 && (
          <span style={{ background: T.greenBg, color: T.green, border: `1px solid ${T.green}44`, borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 700 }}>
            ✓ {completedCount} completed
          </span>
        )}
        {selectedCount > 0 && (
          <span style={{ background: T.amberBg, color: T.amber, border: `1px solid ${T.amber}44`, borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 700 }}>
            📄 {selectedCount} job{selectedCount !== 1 ? "s" : ""} selected
          </span>
        )}
        {dupCount > 0 && (
          <span style={{ background: T.redBg, color: T.red, border: `1px solid ${T.red}44`, borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 700 }}>
            ⚠ {dupCount} duplicate{dupCount !== 1 ? "s" : ""}
          </span>
        )}
        <span style={{ marginLeft: "auto", color: T.textMuted, fontSize: 11, fontWeight: 500 }}>
          Click headers to sort · Click checkbox to mark Complete · Select 📄 checkbox to print bulks
        </span>
      </div>

      {/* Duplicate panel warning mapping */}
      {dupCount > 0 && (
        <div style={{ background: T.redBg, border: `1px solid ${T.red}44`, borderRadius: 16, padding: "14px 20px", boxShadow: "0 8px 24px rgba(0,0,0,0.03)" }}>
          <div style={{ fontWeight: 700, color: T.red, fontSize: 13, marginBottom: 8 }}>
            ⚠️ Duplicate Airway Bill (AWB) or Container ULD Collisions Detected:
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {dayRecords
              .filter((r) => dupIds.has(r.id))
              .map((r) => (
                <div key={r.id} style={{ fontSize: 12, color: T.textMid, background: "#ffffff", border: "1px solid #f3f4f6", borderRadius: 12, padding: "8px 14px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                  <strong style={{ color: "#000000" }}>{r.shipper} (Flight {r.flight})</strong>
                  {dupDetails[r.id]?.map((d, idx) => (
                    <div key={idx} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", fontSize: "11px" }}>
                      <span style={{ background: T.redBg, borderRadius: 12, padding: "3px 10px", color: T.red, fontWeight: 700 }}>
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
                <th style={{ padding: "9px 8px", color: "#000000", fontSize: 9, background: T.surface, borderBottom: `2px solid ${T.border}`, whiteSpace: "nowrap", width: 100, textAlign: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={{ width: 14, height: 14, cursor: "pointer", accentColor: "#b45309" }} title="Select all columns" />
                    <span style={{ fontSize: 8, color: "#000000", fontWeight: 700 }}>📄 JOB SHEET PRINT</span>
                  </div>
                </th>
                <th style={{ padding: "9px 10px", color: "#000000", fontSize: 10, background: T.surface, borderBottom: `2px solid ${T.border}`, whiteSpace: "nowrap", width: 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {finalSorted.map((row, i) => {
                const isComplete = !!row.complete;
                const isDup = dupIds.has(row.id);
                const isJobSelected = selectedJobs.has(row.id);

                let rowBg = i % 2 === 0 ? T.surface : T.surface2;
                if (isComplete) rowBg = "#f0fdf4";
                if (isDup && !isComplete) rowBg = "#fff7ed";
                if (isJobSelected) rowBg = "#fffbeb";

                const hoverBg = isComplete ? "#dcfce7" : isDup ? "#ffedd5" : isJobSelected ? "#fef9c3" : T.accentBg;

                return (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: `1px solid ${isComplete ? "#bbf7d0" : isDup ? "#fed7aa" : isJobSelected ? "#fde68a" : T.border}`,
                      background: rowBg,
                      transition: "background 0.1s",
                      opacity: isComplete ? 0.75 : 1,
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
                    <td style={{ padding: "8px 10px", color: "#000000", fontFamily: "monospace", fontWeight: 800, fontSize: 13, whiteSpace: "nowrap", textDecoration: isComplete ? "line-through" : "none" }}>
                      {row.cutoff || "—"}
                    </td>

                    {/* AWB */}
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                      {isDup ? (
                        <span style={{ background: "#fff7ed", border: "1px solid #f97316", borderRadius: 4, padding: "2px 8px", color: "#000000", fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 14, fontFamily: "monospace" }} title="Duplicate collision alerts screen. Check logs.">
                          ⚠ {row.awb}
                        </span>
                      ) : (
                        <span style={{ color: "#000000", fontSize: 14, fontWeight: 800, fontFamily: "monospace" }}>{row.awb}</span>
                      )}
                    </td>

                    {/* FLIGHT */}
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                      <Pill text={row.flight} color={T.accent} />
                    </td>

                    {/* CLIENT */}
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                      <span style={{ background: "#f5f5f7", color: "#000000", border: "1px solid #d2d2d7", borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>SEAWAY</span>
                    </td>

                    {/* SHIPPER */}
                    <td style={{ padding: "8px 10px", color: "#000000", fontWeight: 600, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: isComplete ? "line-through" : "none" }}>
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
                          background: dupDetails[row.id]?.some((d) => d.type === "ULD") ? "#fff7ed" : "#ffffff",
                          border: dupDetails[row.id]?.some((d) => d.type === "ULD") ? "1.5px solid #f97316" : "1px solid #cbd5e1",
                          borderRadius: 4,
                          padding: "6px 6px",
                          fontSize: 11,
                          color: dupDetails[row.id]?.some((d) => d.type === "ULD") ? "#b45309" : "#000000",
                          fontFamily: "monospace",
                          fontWeight: 850,
                          outline: "none",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                          overflowWrap: "anywhere",
                          overflow: "hidden",
                          lineHeight: "1.3",
                        }}
                      />
                    </td>

                    {/* DEST */}
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                      <span style={{ fontWeight: 800, color: "#000000", fontSize: 13 }}>{row.dest || "—"}</span>
                    </td>

                    {/* DRY ICE */}
                    <td style={{ padding: "8px 10px", color: "#000000", fontSize: 11, whiteSpace: "nowrap" }}>
                      {row.ice && row.ice.trim() ? row.ice : "N/A"}
                    </td>

                    {/* CTO */}
                    <td style={{ padding: "8px 10px", color: "#000000", fontSize: 11, whiteSpace: "nowrap" }}>
                      {row.cto || "—"}
                    </td>

                    {/* COMMODITY */}
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                      <Pill text={row.commodity} color={cCol(row.commodity)} />
                    </td>

                    {/* INSTRUCTIONS */}
                    <td style={{ padding: "8px 10px", color: "#000000", fontSize: 11, minWidth: 160, whiteSpace: "normal", wordBreak: "break-word" }} title={row.specialInst}>
                      {row.specialInst || "—"}
                    </td>

                    {/* SCR */}
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                      <span style={{ fontWeight: 700, color: "#000000" }}>
                        {row.scr || "—"}
                      </span>
                    </td>

                    {/* LOAD TYPE (editable inline input - e.g. UNIT or LOOSE) */}
                    <td style={{ padding: "4px 8px", whiteSpace: "nowrap", width: 100 }}>
                      <input
                        type="text"
                        value={row.loadType || ""}
                        onChange={(e) => onUpdate?.(row.id, { loadType: e.target.value.toUpperCase() })}
                        title="Load Type (UNIT / LOOSE). Click to edit/adjust"
                        style={{
                          width: "100%",
                          background: "#ffffff",
                          border: "1px solid #d2d2d7",
                          borderRadius: 4,
                          padding: "4px 8px",
                          fontSize: 11,
                          color: "#000000",
                          fontFamily: "monospace",
                          fontWeight: 800,
                          outline: "none",
                          textAlign: "center",
                        }}
                      />
                    </td>

                    {/* OPERATOR */}
                    <td style={{ padding: "8px 10px", color: "#000000", fontSize: 11, whiteSpace: "nowrap" }}>
                      {row.operator || "—"}
                    </td>

                    {/* JOB SELECT CHECKBOX */}
                    <td style={{ padding: "8px 6px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={isJobSelected}
                        onChange={() => toggleJobSelect(row.id)}
                        style={{ width: 15, height: 15, cursor: "pointer", accentColor: "#b45309" }}
                        title="Tick Job Sheet to bulk print"
                      />
                    </td>

                    {/* ACTIONS BUTTONS */}
                    <td style={{ padding: "8px 10px" }}>
                      <div style={{ display: "flex", gap: 3, flexWrap: "nowrap" }}>
                        <button onClick={() => onJobSheet(row)} title="Open Job Sheet editor" style={{ background: "#fef3c7", border: "1px solid #fde68a", color: "#000000", borderRadius: 4, padding: "3px 6px", cursor: "pointer", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>📄 Job</button>
                        <button onClick={() => onLoadsheet(row)} title="Open Load Out Sheet editor" style={{ background: T.greenBg, border: `1px solid #bbf7d0`, color: "#000000", borderRadius: 4, padding: "3px 6px", cursor: "pointer", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>📋 Load</button>
                        <button onClick={() => onEdit(row)} style={{ background: T.accentBg, border: `1px solid #bfdbfe`, color: "#000000", borderRadius: 4, padding: "3px 6px", cursor: "pointer", fontSize: 11, whiteSpace: "nowrap" }}>Edit</button>
                        <DeleteButton id={row.id} onDelete={onDelete} />
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

      {/* SOP & FAQ Operations Instruction Manual Panel */}
      <div
        id="sop-operations-manual"
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: 20,
          boxShadow: "0 4px 20px rgba(0,0,0,0.02)",
          overflow: "hidden",
          marginTop: 12,
          transition: "all 0.2s ease-in-out",
        }}
      >
        <button
          onClick={() => setShowSopGuide(!showSopGuide)}
          style={{
            width: "100%",
            background: "linear-gradient(to right, #f8fafc, #ffffff)",
            border: "none",
            outline: "none",
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              background: T.accentBg,
              color: T.accent,
              borderRadius: "50%",
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <BookOpen size={16} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 750, color: T.text, display: "flex", alignItems: "center", gap: 8 }}>
                Operations Standard Operating Procedures (SOP) & FAQs
                <span style={{
                  background: "#fee2e2",
                  color: "#991b1b",
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 12,
                  letterSpacing: "0.03em"
                }}>
                  ACTIVE PROTOCOL
                </span>
              </h3>
              <p style={{ margin: "2px 0 0 0", fontSize: 11, color: T.textMuted }}>
                Reference guide for manifest validation, cold-chain temperature cutoff control, and active ULD container handling standards.
              </p>
            </div>
          </div>
          <div style={{ color: T.textMuted }}>
            {showSopGuide ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </button>

        {showSopGuide && (
          <div style={{ borderTop: "1px solid #f1f5f9", padding: "20px 24px" }}>
            {/* Header Tabs inside Manual Panel */}
            <div style={{ display: "flex", gap: 8, borderBottom: "1px solid #e2e8f0", paddingBottom: 12, marginBottom: 16 }}>
              <button
                onClick={() => setSopSubTab("sop")}
                style={{
                  background: sopSubTab === "sop" ? T.accentBg : "transparent",
                  border: "none",
                  color: sopSubTab === "sop" ? T.accent : T.textMid,
                  fontWeight: 700,
                  fontSize: 12,
                  padding: "6px 16px",
                  borderRadius: 10,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  transition: "all 0.15s"
                }}
              >
                <BookOpen size={14} />
                <span>Standard Operating Procedures (SOP)</span>
              </button>
              <button
                onClick={() => setSopSubTab("faq")}
                style={{
                  background: sopSubTab === "faq" ? T.accentBg : "transparent",
                  border: "none",
                  color: sopSubTab === "faq" ? T.accent : T.textMid,
                  fontWeight: 700,
                  fontSize: 12,
                  padding: "6px 16px",
                  borderRadius: 10,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  transition: "all 0.15s"
                }}
              >
                <HelpCircle size={14} />
                <span>Frequently Asked Questions (FAQ)</span>
              </button>
            </div>

            {/* Panel Tab Sub-View */}
            {sopSubTab === "sop" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* SOP Grid of 4 Core Phases */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                  {/* Step 1 */}
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: T.accent, textTransform: "uppercase", letterSpacing: "0.05em" }}>Phase 01</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#1e293b", background: "#e2e8f0", padding: "2px 6px", borderRadius: 4 }}>INTAKE</span>
                    </div>
                    <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.text }}>Manifest & AWB Validation</h4>
                    <p style={{ margin: 0, fontSize: 11.5, color: T.textMid, lineHeight: "1.5" }}>
                      Each entry must have a valid Air Waybill (AWB) format (typically 3 digits - 8 hyphenated digits). Check for duplicate serials inside the daily ledger to prevent cross-booking conflicts. Correct the Shipper context to guarantee correct customs reporting upon departure.
                    </p>
                  </div>

                  {/* Step 2 */}
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: T.accent, textTransform: "uppercase", letterSpacing: "0.05em" }}>Phase 02</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#9a3412", background: "#ffedd5", padding: "2px 6px", borderRadius: 4 }}>COLD CHAIN</span>
                    </div>
                    <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.text }}>Dry Ice & Temp Controls</h4>
                    <p style={{ margin: 0, fontSize: 11.5, color: T.textMid, lineHeight: "1.5" }}>
                      For thermo-sensitive or high-risk shipments, input the exact Dry Ice weight in the <code style={{fontFamily:"monospace", color:"#9a3412", fontWeight:700}}>ICE (KG)</code> field. The cutoff window is automatically checked against the active carrier schedules; verify the <code style={{fontFamily:"monospace", color:"#1e40af", fontWeight:700}}>Cutoff Time</code> to avoid warm cargo tarmac exposure.
                    </p>
                  </div>

                  {/* Step 3 */}
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: T.accent, textTransform: "uppercase", letterSpacing: "0.05em" }}>Phase 03</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#166534", background: "#dcfce7", padding: "2px 6px", borderRadius: 4 }}>U.L.D.</span>
                    </div>
                    <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.text }}>Load Sheet Planning</h4>
                    <p style={{ margin: 0, fontSize: 11.5, color: T.textMid, lineHeight: "1.5" }}>
                      Click <code style={{fontFamily:"monospace", color:"#15803d", fontWeight:705}}>📋 Load</code> to configure the Load Out document. Double check that the container prefix matches standard configurations (e.g. AKE, PMC, ALF) and map out active cargo weight distributions. Ensure the load type is designated as <strong style={{fontWeight:700}}>UNIT</strong> or <strong style={{fontWeight:700}}>LOOSE</strong>.
                    </p>
                  </div>

                  {/* Step 4 */}
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: T.accent, textTransform: "uppercase", letterSpacing: "0.05em" }}>Phase 04</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#0f172a", background: "#f1f5f9", padding: "2px 6px", borderRadius: 4 }}>DISPATCH</span>
                    </div>
                    <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.text }}>Dispersal & Operations Sync</h4>
                    <p style={{ margin: 0, fontSize: 11.5, color: T.textMid, lineHeight: "1.5" }}>
                      Track completion checkboxes on loaded flights. Generate single-row job records with the <code style={{fontFamily:"monospace", color:"#b45309", fontWeight:700}}>📄 Job</code> action. At shift-end, run a full <code style={{fontFamily:"monospace", color:T.accent, fontWeight:700}}>Export to Excel</code> payload backup to ensure historical records remain secure.
                    </p>
                  </div>
                </div>

                {/* Checklist Footer Note */}
                <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 12, padding: "12px 16px", display: "flex", gap: 10, alignItems: "start" }}>
                  <Info size={16} style={{ color: "#2563eb", marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <strong style={{ fontSize: 12, color: "#1e3a8a", display: "block" }}>Protip: Multi-device Live Sync</strong>
                    <span style={{ fontSize: 11, color: "#1e40af", lineHeight: "1.4" }}>
                      Because the platform operates on an active Cloud Core Database, multiple dispatchers can open the workspace links in separate tabs or devices. Updates to checkboxes, load sheets, and flight times occur securely in real-time. Keep the network status bar green for automatic syncing.
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Q1 */}
                <div style={{ borderBottom: "1px solid #f1f5f9", paddingBottom: 14 }}>
                  <h4 style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: T.text }}>
                    Q: What does the Red Conflict Badge denote next to an Air Waybill or ULD?
                  </h4>
                  <p style={{ margin: "6px 0 0 0", fontSize: 11.5, color: T.textMid, lineHeight: "1.4" }}>
                    When multiple cargo logs on the same operations manifest are assigned identical AWB numbers or individual high-fidelity container numbers (e.g., PMC12345QF), the system highlights them automatically. This acts as a safe dispatcher guard to prevent double-loading container numbers or placing overlapping labels on cargo routes.
                  </p>
                </div>

                {/* Q3 */}
                <div style={{ borderBottom: "1px solid #f1f5f9", paddingBottom: 14 }}>
                  <h4 style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: T.text }}>
                    Q: How is the cutoff time checked against airline schedules?
                  </h4>
                  <p style={{ margin: "6px 0 0 0", fontSize: 11.5, color: T.textMid, lineHeight: "1.4" }}>
                    The application matches the shipment's flight number against active timetables configured in the <strong>Flight Schedules</strong> manager tab. If the current cutoff meets or exceeds standard thresholds, it lights up correctly. You can edit carrier timetables in the manager tab to keep operational thresholds up-to-date.
                  </p>
                </div>

                {/* Q4 */}
                <div style={{ borderBottom: "1px solid #f1f5f9", paddingBottom: 14 }}>
                  <h4 style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: T.text }}>
                    Q: What happens if our terminal database loses internet connectivity?
                  </h4>
                  <p style={{ margin: "6px 0 0 0", fontSize: 11.5, color: T.textMid, lineHeight: "1.4" }}>
                    The UI remains fully functional! The loadsheet and manifest engine gracefully fall back to local browser state storage. Once connection to the Cloud database is restored or the user hits the reconnect anchor, updates are synced safely with zero data loss.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
