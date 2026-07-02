/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from "react";
import { Download, Upload, Search, Mail, Phone, Info, ChevronDown, ChevronUp, FileText, Globe, Users } from "lucide-react";
import * as XLSX from "xlsx";
import { FlightSchedule, FlightInfo, CtoDirectory } from "../types";
import { T, INP, SEL } from "../utils/theme";
import { DEFAULT_SCHEDULE } from "../data/mockData";
import { getAvailableCtos, getAirlineForFlight } from "../utils/helpers";

interface FlightAdminProps {
  schedule: FlightSchedule;
  onChange: (updatedSchedule: FlightSchedule) => void;
  highlightFlight?: string | null;
  onClearHighlightFlight?: () => void;
  ctoDirectory: CtoDirectory;
}

interface RowData extends FlightInfo {
  flight: string;
  airline: string;
  gsa: string;
}

export const formatTimeField = (val: string): string => {
  const clean = val.trim();
  if (!clean) return "";

  // Detect +1 / (+1) / +2 / (+2) etc. at the end
  const plusOneMatch = clean.match(/[\s(]*\+\s*([0-9])\s*\)?$/);
  let suffix = "";
  let timePart = clean;
  if (plusOneMatch) {
    suffix = ` (+${plusOneMatch[1]})`;
    timePart = clean.slice(0, plusOneMatch.index).trim();
  }

  // Now process the timePart digits
  const digits = timePart.replace(/\D/g, "");
  if (!digits) return clean; // if no digits, return original

  let formattedTime = "";
  if (digits.length === 3) {
    formattedTime = "0" + digits.slice(0, 1) + ":" + digits.slice(1);
  } else if (digits.length === 4) {
    formattedTime = digits.slice(0, 2) + ":" + digits.slice(2);
  } else if (timePart.includes(":")) {
    const parts = timePart.split(":");
    const h = parts[0].replace(/\D/g, "").padStart(2, "0");
    const m = parts[1].replace(/\D/g, "").padEnd(2, "0").slice(0, 2);
    formattedTime = `${h}:${m}`;
  } else {
    formattedTime = timePart;
  }

  return formattedTime + suffix;
};

export const convertNumericDaysToMTWTFSS = (daysStr: string): string => {
  const trimmed = daysStr.trim();
  if (!trimmed) return ".......";

  // If the input has any digits from 1 to 7, convert it to MTWTFSS pattern
  if (/[1-7]/.test(trimmed)) {
    const template = [".", ".", ".", ".", ".", ".", "."];
    const mappings: { [key: string]: { char: string; idx: number } } = {
      "1": { char: "M", idx: 0 },
      "2": { char: "T", idx: 1 },
      "3": { char: "W", idx: 2 },
      "4": { char: "T", idx: 3 },
      "5": { char: "F", idx: 4 },
      "6": { char: "S", idx: 5 },
      "7": { char: "S", idx: 6 },
    };

    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (mappings[ch]) {
        template[mappings[ch].idx] = mappings[ch].char;
      }
    }
    return template.join("");
  }

  if (trimmed.toUpperCase() === "DAILY") {
    return "MTWTFSS";
  }

  return trimmed.toUpperCase();
};

export const FlightAdmin: React.FC<FlightAdminProps> = ({
  schedule,
  onChange,
  highlightFlight,
  onClearHighlightFlight,
  ctoDirectory,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedFlights, setExpandedFlights] = useState<Record<string, boolean>>({});

  const toggleExpand = (f: string) => {
    setExpandedFlights((prev) => ({ ...prev, [f]: !prev[f] }));
  };

  const [rows, setRows] = useState<RowData[]>(() =>
    Object.entries(schedule).map(([flight, v]) => {
      const info = v as FlightInfo;
      return {
        flight,
        ...info,
        cutoff: formatTimeField(info.cutoff || ""),
        etd: formatTimeField(info.etd || ""),
        eta: formatTimeField(info.eta || ""),
        origin: info.origin || "MEL",
        airline: info.airline || getAirlineForFlight(flight),
        days: info.days || "",
        gsa: info.gsa || "",
        emailContacts: info.emailContacts || "",
        contactPhone: info.contactPhone || "",
        bookingPortal: info.bookingPortal || "",
        bookingNotes: info.bookingNotes || "",
        looseCutoffExempt: info.looseCutoffExempt || false,
        looseCutoffTime: info.looseCutoffTime || "",
      };
    })
  );
  const [search, setSearch] = useState("");
  const [editRow, setEditRow] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<RowData | null>(null);
  const [confirmDeleteFlight, setConfirmDeleteFlight] = useState<string | null>(null);

  React.useEffect(() => {
    setRows(
      Object.entries(schedule).map(([flight, v]) => {
        const info = v as FlightInfo;
        return {
          flight,
          ...info,
          cutoff: formatTimeField(info.cutoff || ""),
          etd: formatTimeField(info.etd || ""),
          eta: formatTimeField(info.eta || ""),
          origin: info.origin || "MEL",
          airline: info.airline || getAirlineForFlight(flight),
          days: info.days || "",
          gsa: info.gsa || "",
          emailContacts: info.emailContacts || "",
          contactPhone: info.contactPhone || "",
          bookingPortal: info.bookingPortal || "",
          bookingNotes: info.bookingNotes || "",
          looseCutoffExempt: info.looseCutoffExempt || false,
          looseCutoffTime: info.looseCutoffTime || "",
        };
      })
    );
  }, [schedule]);

  // Sorting and Row Hovering States
  const [sortField, setSortField] = useState<"flight" | "origin" | "dest" | "cto" | "airline" | "days" | "gsa" | null>(null);
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const handleSort = (field: "flight" | "origin" | "dest" | "cto" | "airline" | "days" | "gsa") => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const renderSortIndicator = (field: "flight" | "origin" | "dest" | "cto" | "airline" | "days" | "gsa") => {
    if (sortField === field) {
      return (
          <span style={{ color: T.accent, marginLeft: 4, fontWeight: "bold" }}>
          {sortAsc ? "▲" : "▼"}
        </span>
      );
    }
    return (
        <span style={{ color: "#cbd5e1", marginLeft: 4 }}>
        ↕
      </span>
    );
  };

  const getSoftColor = (hex: string, alpha: string = "12") => {
    if (!hex || !hex.startsWith("#")) return undefined;
    let clean = hex;
    if (hex.length === 4) {
      clean = "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    }
    return clean + alpha;
  };

  const getRowBgColor = (ctoStr: string, isHovered: boolean, index: number) => {
    const assignedCto = (ctoStr || "").trim().toUpperCase();
    const ctoInfo = ctoDirectory ? ctoDirectory[assignedCto] : undefined;
    const ctoColor = ctoInfo?.color;
    
    if (ctoColor) {
      // Use a highly visible, beautiful translucent wash of the dynamically selected CTO highlight color
      return isHovered ? getSoftColor(ctoColor, "50") : getSoftColor(ctoColor, "25");
    }
    
    // Return clean zebra striping if no CTO or no color
    return isHovered ? T.accentBg : (index % 2 === 0 ? T.surface : T.surface2);
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = q
      ? rows.filter((r) =>
          [r.airline || "", r.flight, r.days || "", r.origin || "", r.dest, r.cto, r.cutoff, r.etd, r.eta, r.emailContacts || "", r.contactPhone || "", r.bookingPortal || "", r.bookingNotes || ""]
            .join(" ")
            .toLowerCase()
            .includes(q)
        )
      : [...rows];

    if (sortField) {
      list.sort((a, b) => {
        const valA = (a[sortField] || "").trim().toUpperCase();
        const valB = (b[sortField] || "").trim().toUpperCase();
        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
      });
    }
    return list;
  }, [rows, search, sortField, sortAsc]);

  const openEdit = (r: RowData) => {
    setEditRow(r.flight);
    setEditForm({ ...r });
    // Auto expand too so they can configure booking notes immediately
    setExpandedFlights((prev) => ({ ...prev, [r.flight]: true }));
  };

  React.useEffect(() => {
    if (highlightFlight) {
      setSearch(highlightFlight);
      const found = rows.find(r => r.flight.toUpperCase() === highlightFlight.toUpperCase());
      if (found) {
        setExpandedFlights((prev) => ({ ...prev, [found.flight]: true }));
      }
      onClearHighlightFlight?.();
    }
  }, [highlightFlight, rows, onClearHighlightFlight]);

  const saveEdit = () => {
    if (!editForm) return;
    if (!editForm.flight.trim()) {
      alert("⚠️ Flight code is required.");
      return;
    }

    const cleanForm = {
      ...editForm,
      days: convertNumericDaysToMTWTFSS(editForm.days || ""),
    };

    const updated = rows.map((r) => (r.flight === editRow ? cleanForm : r));
    setRows(updated);
    
    const ns: FlightSchedule = {};
    updated.forEach(({ flight, cutoff, origin, dest, cto, etd, eta, airline, days, gsa, emailContacts, contactPhone, bookingPortal, bookingNotes, looseCutoffExempt, looseCutoffTime }) => {
      ns[flight] = { cutoff, origin: origin || "MEL", dest, cto, etd, eta, airline, days, gsa: gsa || "", emailContacts, contactPhone, bookingPortal, bookingNotes, looseCutoffExempt, looseCutoffTime };
    });
    
    onChange(ns);
    setEditRow(null);
  };

  const addNew = () => {
    const nr: RowData = {
      flight: "NEW_" + Date.now().toString().slice(-4),
      cutoff: "",
      origin: "MEL",
      dest: "",
      cto: "QANTAS",
      etd: "",
      eta: "",
      airline: "",
      days: "",
      gsa: "",
      emailContacts: "",
      contactPhone: "",
      bookingPortal: "",
      bookingNotes: "",
      looseCutoffExempt: false,
      looseCutoffTime: "",
    };
    setRows((r) => [...r, nr]);
    setEditRow(nr.flight);
    setEditForm({ ...nr });
    // Expand for edit
    setExpandedFlights((prev) => ({ ...prev, [nr.flight]: true }));
  };

  const deleteRow = (f: string) => {
    const u = rows.filter((r) => r.flight !== f);
    setRows(u);
    
    const ns: FlightSchedule = {};
    u.forEach(({ flight, cutoff, origin, dest, cto, etd, eta, airline, days, gsa, emailContacts, contactPhone, bookingPortal, bookingNotes, looseCutoffExempt, looseCutoffTime }) => {
      ns[flight] = { cutoff, origin: origin || "MEL", dest, cto, etd, eta, airline, days, gsa: gsa || "", emailContacts, contactPhone, bookingPortal, bookingNotes, looseCutoffExempt, looseCutoffTime };
    });
    
    onChange(ns);
    if (editRow === f) {
      setEditRow(null);
    }
  };

  const ef = (k: keyof RowData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    if (!editForm) return;
    const isNotesOrEmails = k === "emailContacts" || k === "bookingNotes" || k === "bookingPortal";
    const val = isNotesOrEmails ? e.target.value : e.target.value.toUpperCase();
    let nextForm = { ...editForm, [k]: val };
    if (k === "flight" && val.length >= 2) {
      const derived = getAirlineForFlight(val);
      if (derived && !editForm.airline) {
        nextForm.airline = derived;
      }
    }
    setEditForm(nextForm);
  };

  const handleTimeBlur = (k: "cutoff" | "etd" | "eta") => () => {
    if (!editForm) return;
    const formatted = formatTimeField(editForm[k] || "");
    setEditForm({ ...editForm, [k]: formatted });
  };

  const downloadTemplate = () => {
    const headers = ["AIRLINE", "FLIGHT*", "DAYS", "CUTOFF*", "LOOSE EXEMPTION", "LOOSE CUTOFF TIME", "ORIGIN*", "DESTINATION*", "CTO*", "ETD", "ETA", "GSA/AIRLINE", "EMAIL CONTACTS", "CONTACT PHONE NUMBER", "BOOKING PORTAL WEBSITE", "AIRLINE BOOKING NOTES"];
    
    // Map current saved rows to Excel format
    const exportRows = rows.map((r) => [
      r.airline || "",
      r.flight || "",
      r.days || "",
      r.cutoff || "",
      r.looseCutoffExempt ? "YES" : "NO",
      r.looseCutoffTime || "",
      r.origin || "MEL",
      r.dest || "",
      r.cto || "",
      r.etd || "",
      r.eta || "",
      r.gsa || "",
      r.emailContacts || "",
      r.contactPhone || "",
      r.bookingPortal || "",
      r.bookingNotes || ""
    ]);

    // If there is no saved flight data, default to the sample row
    if (exportRows.length === 0) {
      exportRows.push([
        "QANTAS",
        "QF029",
        "MTWTFSS",
        "0720",
        "NO",
        "",
        "MEL",
        "HKG",
        "QANTAS",
        "1015",
        "1755",
        "QANTAS CARGO",
        "dispatch@qantas.com",
        "+61 3 9999 8888",
        "https://qantas.com/cargo",
        "Pre-alert required 4 hours prior. Cargo cutoff strict."
      ]);
    }
    
    // Create Excel worksheet
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...exportRows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "FlightSchedules");
    
    // Write array buffer
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flight_schedule_template.xlsx";
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

        const headers = rawRows[0].map((h: any) => String(h || "").trim().toLowerCase().replace(/\*/g, "").replace(/\s+/g, ""));
        const colIdx = (key: string) => headers.indexOf(key);

        const getCell = (row: any[], keys: string[]) => {
          for (const key of keys) {
            const idx = colIdx(key.replace(/\s+/g, ""));
            if (idx >= 0 && row[idx] !== undefined && row[idx] !== null) {
              return String(row[idx]).trim();
            }
          }
          return "";
        };

        const updatedRows: RowData[] = [...rows];
        let imported = 0;

        rawRows.slice(1).forEach((cleanRow) => {
          if (!cleanRow || cleanRow.length === 0) return;
          if (cleanRow.every(c => c === undefined || c === null || String(c).trim() === "")) return;

          const flight = getCell(cleanRow, ["flight"]).toUpperCase();
          if (!flight) return;

          const airline = getCell(cleanRow, ["airline"]) || getAirlineForFlight(flight);
          const days = convertNumericDaysToMTWTFSS(getCell(cleanRow, ["days"]));
          const cutoff = formatTimeField(getCell(cleanRow, ["cutoff"]));
          const origin = getCell(cleanRow, ["origin", "orgin"]).toUpperCase() || "MEL";
          const dest = getCell(cleanRow, ["destination", "dest"]).toUpperCase();
          const cto = getCell(cleanRow, ["cto"]).toUpperCase() || "QANTAS";
          const etd = formatTimeField(getCell(cleanRow, ["etd"]));
          const eta = formatTimeField(getCell(cleanRow, ["eta"]));
          const gsa = getCell(cleanRow, ["gsa", "gsa/airline", "gsaairline", "gsa_airline", "gsa airline"]);
          const emailContacts = getCell(cleanRow, ["email", "emails", "emailcontacts", "emailcontact", "email contacts"]);
          const contactPhone = getCell(cleanRow, ["phone", "phones", "contactphone", "contactphones", "telephone", "phone number", "contact phone number", "contactphone#"]);
          const bookingPortal = getCell(cleanRow, ["portal", "bookingportal", "bookingportalwebsite", "portalwebsite", "website", "booking portal", "booking portal website"]);
          const bookingNotes = getCell(cleanRow, ["notes", "bookingnotes", "airlinebookingnotes", "airline.bookingnotes", "airline booking notes", "booking notes"]);

          const exemptionVal = getCell(cleanRow, ["looseexemption", "loosecutoffexemption", "exemption", "loose_cutoff_exempt", "loosecutoffexempt", "loose exemption", "loose cutoff exemption"]).toLowerCase();
          const looseCutoffExempt = exemptionVal === "true" || exemptionVal === "yes" || exemptionVal === "1" || exemptionVal === "y";
          let looseCutoffTime = getCell(cleanRow, ["loosecutofftime", "loose_cutoff_time", "loosecutofftime", "loose cutoff time"]);
          if (looseCutoffTime) {
            const digits = looseCutoffTime.replace(/\D/g, "");
            if (digits.length === 3) {
              looseCutoffTime = "0" + digits;
            } else if (digits.length === 4) {
              looseCutoffTime = digits;
            }
          }

          const existingIdx = updatedRows.findIndex((r) => r.flight === flight);
          const flightData: RowData = {
            flight,
            cutoff,
            origin,
            dest,
            cto,
            etd,
            eta,
            airline,
            days,
            gsa,
            emailContacts,
            contactPhone,
            bookingPortal,
            bookingNotes,
            looseCutoffExempt,
            looseCutoffTime,
          };

          if (existingIdx >= 0) {
            updatedRows[existingIdx] = flightData;
          } else {
            updatedRows.push(flightData);
          }
          imported++;
        });

        if (imported === 0) {
          alert("No valid flight rows found in the template file.");
          return;
        }

        setRows(updatedRows);

        const ns: FlightSchedule = {};
        updatedRows.forEach(({ flight, cutoff, origin, dest, cto, etd, eta, airline, days, gsa, emailContacts, contactPhone, bookingPortal, bookingNotes, looseCutoffExempt, looseCutoffTime }) => {
          ns[flight] = { cutoff, origin, dest, cto, etd, eta, airline, days, gsa, emailContacts, contactPhone, bookingPortal, bookingNotes, looseCutoffExempt, looseCutoffTime };
        });
        onChange(ns);

        alert(`✓ Successfully imported/updated ${imported} flight schedules!`);
      } catch (err) {
        console.error(err);
        alert("Error parsing template file. Please make sure format matches template.");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const thStyle: React.CSSProperties = {
    padding: "12px 14px",
    textAlign: "left",
    fontWeight: 600,
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: T.textMuted,
    background: T.surface,
    borderBottom: "1px solid #e5e7eb",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      <div
        style={{
          background: T.surface,
          border: "1px solid #e5e7eb",
          borderRadius: 16, // Beautifully rounded bubbly card
          padding: "12px 18px",
          display: "flex",
          gap: 12,
          alignItems: "center",
          boxShadow: "0 8px 24px rgba(0,0,0,0.03)",
        }}
      >
        <input
          style={{ ...INP, flex: "1 1 auto" }}
          value={search}
          onChange={(e) => setSearch(e.target.value.toUpperCase())} // Auto capitalization on typing!
          placeholder="Search flights, airlines, or operation days..."
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            style={{
              background: "#f5f5f7",
              border: "1px solid #e5e7eb",
              color: T.textMid,
              borderRadius: 20, // Capsule pill button
              padding: "8px 16px",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Clear
          </button>
        )}
         <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: "none" }}
          onChange={handleImportFile}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            color: "#1e40af",
            borderRadius: 20, // Capsule pill button
            padding: "9px 18px",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: "nowrap",
            display: "flex",
            alignItems: "center",
            gap: 6,
            transition: "all 0.15s",
          }}
          title="Upload Excel/CSV template to insert or update flight schedules in bulk"
        >
          <Upload size={14} /> Import Excel / CSV
        </button>
        <button
          onClick={downloadTemplate}
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            color: "#475569",
            borderRadius: 20, // Capsule pill button
            padding: "9px 18px",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: "nowrap",
            display: "flex",
            alignItems: "center",
            gap: 6,
            transition: "all 0.15s",
          }}
          title="Download the updated Excel template for flight schedules"
        >
          <Download size={14} /> Template Download
        </button>
        <button
          onClick={addNew}
          style={{
            background: T.accent,
            border: "none",
            color: "#fff",
            borderRadius: 20, // Capsule pill button
            padding: "9px 20px",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          + Add Flight
        </button>
        <span style={{ fontSize: 12, color: T.textMuted, whiteSpace: "nowrap" }}>
          {filtered.length} flight{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div
        style={{
          background: T.surface,
          border: "1px solid #e5e7eb",
          borderRadius: 16, // Beautifully rounded bubbly table wrapper
          overflow: "hidden",
          boxShadow: "0 8px 24px rgba(0,0,0,0.03)",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th
                style={{ ...thStyle, cursor: "pointer", userSelect: "none" }}
                onClick={() => handleSort("airline")}
              >
                Airline{renderSortIndicator("airline")}
              </th>
              <th
                style={{ ...thStyle, cursor: "pointer", userSelect: "none" }}
                onClick={() => handleSort("gsa")}
              >
                GSA/AIRLINE{renderSortIndicator("gsa")}
              </th>
              <th
                style={{ ...thStyle, cursor: "pointer", userSelect: "none" }}
                onClick={() => handleSort("flight")}
              >
                Flight{renderSortIndicator("flight")}
              </th>
              <th
                style={{ ...thStyle, cursor: "pointer", userSelect: "none" }}
                onClick={() => handleSort("days")}
              >
                Days{renderSortIndicator("days")}
              </th>
              <th style={thStyle}>Cutoff</th>
              <th
                style={{ ...thStyle, cursor: "pointer", userSelect: "none" }}
                onClick={() => handleSort("origin")}
              >
                Origin{renderSortIndicator("origin")}
              </th>
              <th
                style={{ ...thStyle, cursor: "pointer", userSelect: "none" }}
                onClick={() => handleSort("dest")}
              >
                Destination{renderSortIndicator("dest")}
              </th>
              <th
                style={{ ...thStyle, cursor: "pointer", userSelect: "none" }}
                onClick={() => handleSort("cto")}
              >
                CTO{renderSortIndicator("cto")}
              </th>
              <th style={thStyle}>ETD</th>
              <th style={thStyle}>ETA</th>
              <th style={{ ...thStyle, width: 140 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.flatMap((r, i) => {
              const isEditing = editRow === r.flight;
              const isExpanded = !!expandedFlights[r.flight];
              const hasNotes = !!(r.emailContacts || r.contactPhone || r.bookingPortal || r.bookingNotes);

              const assignedCto = (r.cto || "").trim().toUpperCase();
              const ctoInfo = ctoDirectory ? ctoDirectory[assignedCto] : undefined;
              const ctoColor = ctoInfo?.color || "#64748b";

              const mainRow = isEditing && editForm ? (
                <tr key={r.flight} style={{ background: "#eff6ff", borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: "5px 8px" }}>
                    <input
                      style={{ ...INP, width: 150, textTransform: "uppercase", fontWeight: 700 }}
                      value={editForm.airline}
                      onChange={ef("airline")}
                      placeholder="Airline Name"
                    />
                  </td>
                  <td style={{ padding: "5px 8px" }}>
                    <input
                      style={{ ...INP, width: 120, textTransform: "uppercase", fontWeight: 700 }}
                      value={editForm.gsa || ""}
                      onChange={ef("gsa")}
                      placeholder="GSA / Airline"
                    />
                  </td>
                  <td style={{ padding: "5px 8px" }}>
                    <input
                      style={{ ...INP, width: 90, textTransform: "uppercase", fontWeight: 700 }}
                      value={editForm.flight}
                      onChange={ef("flight")}
                    />
                  </td>
                  <td style={{ padding: "5px 8px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <input
                        style={{ ...INP, width: 110, textTransform: "uppercase", fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.05em" }}
                        value={editForm.days || ""}
                        onChange={ef("days")}
                        placeholder="MTWTFSS"
                        maxLength={7}
                      />
                      <div style={{ display: "flex", gap: "2px" }}>
                        {["M", "T", "W", "T", "F", "S", "S"].map((dayChar, dayIdx) => {
                          const currentDays = (editForm.days || ".......").padEnd(7, ".").split("");
                          const isActive = currentDays[dayIdx] !== "." && currentDays[dayIdx] !== "-" && currentDays[dayIdx] !== " ";
                          return (
                            <button
                              key={dayIdx}
                              type="button"
                              onClick={() => {
                                let chars = (editForm.days || ".......").padEnd(7, ".").split("");
                                chars[dayIdx] = isActive ? "." : dayChar;
                                setEditForm({ ...editForm, days: chars.join("") });
                              }}
                              style={{
                                width: 15,
                                height: 15,
                                borderRadius: "50%",
                                background: isActive ? T.accent : "#e2e8f0",
                                color: isActive ? "#fff" : "#64748b",
                                border: "none",
                                fontSize: 8,
                                fontWeight: 700,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                transition: "all 0.15s",
                              }}
                              title={`Toggle ${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][dayIdx]}`}
                            >
                              {dayChar}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "5px 8px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <input
                        style={{ ...INP, width: 80 }}
                        value={editForm.cutoff}
                        onChange={ef("cutoff")}
                        onBlur={handleTimeBlur("cutoff")}
                        placeholder="Cutoff"
                      />
                      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "10px", cursor: "pointer", fontWeight: "bold", color: "#475569", userSelect: "none" }}>
                        <input
                          type="checkbox"
                          checked={!!editForm.looseCutoffExempt}
                          onChange={(e) => setEditForm({ ...editForm, looseCutoffExempt: e.target.checked })}
                        />
                        Exempt
                      </label>
                      {editForm.looseCutoffExempt && (
                        <input
                          style={{ ...INP, width: 80, fontSize: "11px", padding: "4px 6px" }}
                          value={editForm.looseCutoffTime || ""}
                          onChange={(e) => {
                            let val = e.target.value.toUpperCase();
                            // If user types numbers, we can format it on blur or just let them type
                            setEditForm({ ...editForm, looseCutoffTime: val });
                          }}
                          onBlur={(e) => {
                            let val = e.target.value.replace(/\D/g, "");
                            if (val.length === 3) {
                              val = "0" + val;
                            }
                            setEditForm({ ...editForm, looseCutoffTime: val });
                          }}
                          placeholder="Loose Cutoff"
                        />
                      )}
                    </div>
                  </td>
                  <td style={{ padding: "5px 8px" }}>
                    <input
                      style={{ ...INP, width: 80, textTransform: "uppercase" }}
                      value={editForm.origin || ""}
                      onChange={ef("origin")}
                      placeholder="Origin"
                    />
                  </td>
                  <td style={{ padding: "5px 8px" }}>
                    <input
                      style={{ ...INP, width: 80, textTransform: "uppercase" }}
                      value={editForm.dest}
                      onChange={ef("dest")}
                    />
                  </td>
                  <td style={{ padding: "5px 8px" }}>
                    <select style={{ ...SEL, width: 130 }} value={editForm.cto} onChange={ef("cto")}>
                      {getAvailableCtos().map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: "5px 8px" }}>
                    <input
                      style={{ ...INP, width: 80 }}
                      value={editForm.etd}
                      onChange={ef("etd")}
                      onBlur={handleTimeBlur("etd")}
                    />
                  </td>
                  <td style={{ padding: "5px 8px" }}>
                    <input
                      style={{ ...INP, width: 100 }}
                      value={editForm.eta}
                      onChange={ef("eta")}
                      onBlur={handleTimeBlur("eta")}
                    />
                  </td>
                  <td style={{ padding: "5px 8px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={saveEdit}
                        style={{
                          background: T.green,
                          border: "none",
                          color: "#fff",
                          borderRadius: 4,
                          padding: "4px 10px",
                          cursor: "pointer",
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditRow(null)}
                        style={{
                          background: T.surface2,
                          border: `1px solid ${T.border2}`,
                          color: T.textMid,
                          borderRadius: 4,
                          padding: "4px 8px",
                          cursor: "pointer",
                          fontSize: 11,
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr
                  key={r.flight}
                  style={{
                    borderBottom: `1px solid ${T.border}`,
                    background: getRowBgColor(r.cto, hoveredRow === r.flight || isExpanded, i),
                    transition: "background 0.15s ease",
                    cursor: "pointer",
                  }}
                  onMouseEnter={() => setHoveredRow(r.flight)}
                  onMouseLeave={() => setHoveredRow(null)}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest("button") || target.closest("input") || target.closest("select") || target.closest("textarea") || target.closest("a")) {
                      return;
                    }
                    toggleExpand(r.flight);
                  }}
                >
                  <td style={{
                    padding: "9px 12px",
                    fontWeight: 700,
                    color: T.accent,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    borderLeft: `5px solid ${ctoColor}`,
                    borderTopLeftRadius: "4px",
                    borderBottomLeftRadius: "4px"
                  }}>
                    {isExpanded ? <ChevronUp size={14} style={{ color: T.textMuted }} /> : <ChevronDown size={14} style={{ color: T.textMuted }} />}
                    <span>{r.airline || "—"}</span>
                    {hasNotes && (
                      <span
                        style={{
                          background: "#fffbeb",
                          border: "1px solid #fef3c7",
                          color: "#d97706",
                          borderRadius: 4,
                          padding: "2px 5px",
                          fontSize: "9px",
                          fontWeight: 600,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 3
                        }}
                        title="Flight Booking Notes & Contacts set"
                      >
                        <Info size={10} /> Notes
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "9px 12px", fontWeight: 700, color: "#475569" }}>{r.gsa || "—"}</td>
                  <td style={{ padding: "9px 12px", fontWeight: 700, color: "#000000" }}>{r.flight}</td>
                  <td style={{ padding: "9px 12px", fontFamily: "monospace", color: "#475569", fontWeight: 700 }}>
                    {r.days || "—"}
                  </td>
                  <td style={{ padding: "9px 12px", fontFamily: "monospace", color: "#000000", fontWeight: 700 }}>
                    <div>{r.cutoff}</div>
                    {r.looseCutoffExempt && (
                      <div style={{ fontSize: "10px", color: "#d97706", background: "#fef3c7", padding: "1px 4px", borderRadius: 4, marginTop: 2, display: "inline-block", fontWeight: 600 }}>
                        Loose: {r.looseCutoffTime || "—"}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "9px 12px", fontWeight: 700, color: "#2563eb" }}>{r.origin || "MEL"}</td>
                  <td style={{ padding: "9px 12px", fontWeight: 700, color: "#000000" }}>{r.dest || "—"}</td>
                  <td style={{ padding: "9px 12px" }}>
                    <span
                      style={{
                        background: getSoftColor(ctoColor, "15") || "#f1f5f9",
                        color: ctoColor,
                        border: `1px solid ${getSoftColor(ctoColor, "35") || "#cbd5e1"}`,
                        borderRadius: "12px",
                        padding: "4px 10px",
                        fontSize: "11px",
                        fontWeight: 750,
                        display: "inline-flex",
                        alignItems: "center"
                      }}
                    >
                      {assignedCto || "—"}
                    </span>
                  </td>
                  <td style={{ padding: "9px 12px", fontFamily: "monospace", color: "#000000" }}>{r.etd || "—"}</td>
                  <td style={{ padding: "9px 12px", fontFamily: "monospace", color: "#000000" }}>{r.eta || "—"}</td>
                  <td style={{ padding: "9px 12px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(r);
                        }}
                        style={{
                          background: T.accentBg,
                          border: `1px solid #bfdbfe`,
                          color: T.accent,
                          borderRadius: 4,
                          padding: "3px 8px",
                          cursor: "pointer",
                          fontSize: 11,
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirmDeleteFlight === r.flight) {
                            deleteRow(r.flight);
                            setConfirmDeleteFlight(null);
                          } else {
                            setConfirmDeleteFlight(r.flight);
                          }
                        }}
                        style={{
                          background: confirmDeleteFlight === r.flight ? "#fee2e2" : T.redBg,
                          border: `1px solid ${confirmDeleteFlight === r.flight ? "#ef4444" : "#fecaca"}`,
                          color: confirmDeleteFlight === r.flight ? "#b91c1c" : T.red,
                          borderRadius: 4,
                          padding: "3px 8px",
                          cursor: "pointer",
                          fontSize: 11,
                          fontWeight: confirmDeleteFlight === r.flight ? 700 : 400,
                        }}
                      >
                        {confirmDeleteFlight === r.flight ? "Sure?" : "Del"}
                      </button>
                    </div>
                  </td>
                </tr>
              );

              const subRow = isEditing && editForm ? (
                <tr key={r.flight + "-edit-sub"} style={{ background: "#f0fdf4" }}>
                  <td colSpan={11} style={{ padding: "12px 18px", borderBottom: `1px solid ${T.border}` }}>
                    <div style={{
                      background: "#ffffff",
                      border: "2px dashed #22c55e",
                      borderRadius: "12px",
                      padding: "16px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.05)"
                    }}>
                      <div style={{ fontWeight: 800, color: "#166534", fontSize: "13px", marginBottom: "12px", display: "flex", gap: "6px", alignItems: "center" }}>
                        <FileText size={16} /> Airline Booking Notes & Contacts Configuration
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "16px", marginBottom: "12px" }}>
                        <div>
                          <label style={{ display: "flex", gap: "4px", alignItems: "center", fontWeight: 600, color: "#334155", fontSize: "11px", marginBottom: "4px" }}>
                            <Users size={12} style={{ color: "#64748b" }} /> GSA/Airline
                          </label>
                          <input
                            style={{ ...INP, width: "100%", textTransform: "uppercase" }}
                            value={editForm.gsa || ""}
                            onChange={ef("gsa")}
                            placeholder="GSA / Agent Name"
                          />
                        </div>
                        <div>
                          <label style={{ display: "flex", gap: "4px", alignItems: "center", fontWeight: 600, color: "#334155", fontSize: "11px", marginBottom: "4px" }}>
                            <Mail size={12} style={{ color: "#64748b" }} /> Email Contacts
                          </label>
                          <input
                            style={{ ...INP, width: "100%" }}
                            value={editForm.emailContacts || ""}
                            onChange={ef("emailContacts")}
                            placeholder=""
                          />
                        </div>
                        <div>
                          <label style={{ display: "flex", gap: "4px", alignItems: "center", fontWeight: 600, color: "#334155", fontSize: "11px", marginBottom: "4px" }}>
                            <Phone size={12} style={{ color: "#64748b" }} /> Contact Phone Number
                          </label>
                          <input
                            style={{ ...INP, width: "100%" }}
                            value={editForm.contactPhone || ""}
                            onChange={ef("contactPhone")}
                            placeholder=""
                          />
                        </div>
                        <div>
                          <label style={{ display: "flex", gap: "4px", alignItems: "center", fontWeight: 600, color: "#334155", fontSize: "11px", marginBottom: "4px" }}>
                            <Globe size={12} style={{ color: "#64748b" }} /> Booking Portal website
                          </label>
                          <input
                            style={{ ...INP, width: "100%" }}
                            value={editForm.bookingPortal || ""}
                            onChange={ef("bookingPortal")}
                            placeholder=""
                          />
                        </div>
                      </div>
                      <div>
                        <label style={{ display: "block", fontWeight: 600, color: "#334155", fontSize: "11px", marginBottom: "4px" }}>Airline Booking Notes</label>
                        <textarea
                          style={{
                            ...INP,
                            width: "100%",
                            height: "70px",
                            resize: "vertical",
                            fontFamily: "inherit",
                            fontSize: "12px"
                          }}
                          value={editForm.bookingNotes || ""}
                          onChange={ef("bookingNotes")}
                          placeholder=""
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              ) : isExpanded ? (
                <tr key={r.flight + "-view-sub"} style={{ background: "transparent" }}>
                  <td colSpan={11} style={{ padding: "12px 18px", borderBottom: `1px solid ${T.border}` }}>
                    <div style={{
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "12px",
                      padding: "14px",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.02)"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", borderBottom: "1px solid #f1f5f9", paddingBottom: "6px" }}>
                        <span style={{ fontWeight: 750, color: T.accent, fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}>
                           <FileText size={14} /> Airline Booking Notes & Contact Details
                        </span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "16px" }}>
                        <div>
                          <div style={{ marginBottom: "4px" }}>
                            <span style={{ fontWeight: 600, color: "#475569", fontSize: "11px", display: "flex", alignItems: "center", gap: "4px" }}>
                              <Users size={12} style={{ color: "#64748b" }} /> GSA/Airline
                            </span>
                          </div>
                          <div style={{ color: r.gsa ? "#0f172a" : "#94a3b8", fontSize: "12px", fontWeight: r.gsa ? 600 : 400 }}>
                            {r.gsa || "— Not Specified —"}
                          </div>
                        </div>
                        <div>
                          <div style={{ marginBottom: "4px" }}>
                            <span style={{ fontWeight: 600, color: "#475569", fontSize: "11px", display: "flex", alignItems: "center", gap: "4px" }}>
                              <Mail size={12} style={{ color: "#64748b" }} /> Email Contacts
                            </span>
                          </div>
                          <div style={{ color: r.emailContacts ? "#0f172a" : "#94a3b8", fontSize: "12px", fontWeight: r.emailContacts ? 500 : 400 }}>
                            {r.emailContacts ? (
                              <a href={`mailto:${r.emailContacts}`} style={{ color: T.accent, textDecoration: "none", fontWeight: 600 }}>{r.emailContacts}</a>
                            ) : "— Not Specified —"}
                          </div>
                        </div>
                        <div>
                          <div style={{ marginBottom: "4px" }}>
                            <span style={{ fontWeight: 600, color: "#475569", fontSize: "11px", display: "flex", alignItems: "center", gap: "4px" }}>
                              <Phone size={12} style={{ color: "#64748b" }} /> Phone Number
                            </span>
                          </div>
                          <div style={{ color: r.contactPhone ? "#0f172a" : "#94a3b8", fontSize: "12px", fontWeight: r.contactPhone ? 500 : 400 }}>
                            {r.contactPhone ? (
                              <a href={`tel:${r.contactPhone}`} style={{ color: T.accent, textDecoration: "none", fontWeight: 600 }}>{r.contactPhone}</a>
                            ) : ""}
                          </div>
                        </div>
                        <div>
                          <div style={{ marginBottom: "4px" }}>
                            <span style={{ fontWeight: 600, color: "#475569", fontSize: "11px", display: "flex", alignItems: "center", gap: "4px" }}>
                              <Globe size={12} style={{ color: "#64748b" }} /> Booking Portal website
                            </span>
                          </div>
                          <div style={{ color: r.bookingPortal ? "#0f172a" : "#94a3b8", fontSize: "12px", fontWeight: r.bookingPortal ? 500 : 400 }}>
                            {r.bookingPortal ? (
                              <a href={r.bookingPortal.startsWith("http") ? r.bookingPortal : `https://${r.bookingPortal}`} target="_blank" rel="noopener noreferrer" style={{ color: T.accent, textDecoration: "none", fontWeight: 600 }}>{r.bookingPortal}</a>
                            ) : ""}
                          </div>
                        </div>
                      </div>
                      <div style={{ marginTop: "12px" }}>
                        <div style={{ marginBottom: "4px" }}>
                          <span style={{ fontWeight: 600, color: "#475569", fontSize: "11px" }}>Booking Notes & Special Instructions</span>
                        </div>
                        <div style={{ color: r.bookingNotes ? "#0f172a" : "#94a3b8", fontSize: "12px", padding: r.bookingNotes ? "8px 10px" : "0", background: r.bookingNotes ? "#ffffff" : "transparent", borderRadius: "6px", border: r.bookingNotes ? "1px solid #e2e8f0" : "none", whiteSpace: "pre-wrap" }}>
                          {r.bookingNotes || ""}
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : null;

              return subRow ? [mainRow, subRow] : [mainRow];
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
};
