/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from "react";
import { Download, Upload, Search } from "lucide-react";
import { FlightSchedule, FlightInfo } from "../types";
import { T, INP, SEL } from "../utils/theme";
import { DEFAULT_SCHEDULE } from "../data/mockData";
import { getAvailableCtos, getAirlineForFlight } from "../utils/helpers";

interface FlightAdminProps {
  schedule: FlightSchedule;
  onChange: (updatedSchedule: FlightSchedule) => void;
}

interface RowData extends FlightInfo {
  flight: string;
  airline: string;
}

export const FlightAdmin: React.FC<FlightAdminProps> = ({ schedule, onChange }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<RowData[]>(() =>
    Object.entries(schedule).map(([flight, v]) => {
      const info = v as FlightInfo;
      return {
        flight,
        ...info,
        airline: info.airline || getAirlineForFlight(flight),
        days: info.days || "",
      };
    })
  );
  const [search, setSearch] = useState("");
  const [editRow, setEditRow] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<RowData | null>(null);
  const [confirmDeleteFlight, setConfirmDeleteFlight] = useState<string | null>(null);

  // Sorting and Row Hovering States
  const [sortField, setSortField] = useState<"flight" | "dest" | "cto" | "airline" | "days" | null>(null);
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const handleSort = (field: "flight" | "dest" | "cto" | "airline" | "days") => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const renderSortIndicator = (field: "flight" | "dest" | "cto" | "airline" | "days") => {
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

  const getRowBgColor = (ctoStr: string, isHovered: boolean, index: number) => {
    const cto = (ctoStr || "").trim().toUpperCase();
    if (cto === "MENZIES") {
      return isHovered ? "#dbeafe" : "#eff6ff"; // Soft blue wash
    }
    if (cto === "QANTAS") {
      return isHovered ? "#fee2e2" : "#fef2f2"; // Soft red wash
    }
    if (cto === "DNATA") {
      return isHovered ? "#dcfce7" : "#f0fdf4"; // Soft green wash
    }
    // Swissport, Toll, other/clear
    return isHovered ? T.accentBg : (index % 2 === 0 ? T.surface : T.surface2);
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = q
      ? rows.filter((r) =>
          [r.airline || "", r.flight, r.days || "", r.dest, r.cto, r.cutoff, r.etd, r.eta]
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
  };

  const saveEdit = () => {
    if (!editForm) return;
    if (!editForm.flight.trim()) {
      alert("⚠️ Flight code is required.");
      return;
    }

    const updated = rows.map((r) => (r.flight === editRow ? { ...editForm } : r));
    setRows(updated);
    
    const ns: FlightSchedule = {};
    updated.forEach(({ flight, cutoff, dest, cto, etd, eta, airline, days }) => {
      ns[flight] = { cutoff, dest, cto, etd, eta, airline, days };
    });
    
    onChange(ns);
    setEditRow(null);
  };

  const addNew = () => {
    const nr: RowData = { flight: "NEW_" + Date.now().toString().slice(-4), cutoff: "", dest: "", cto: "QANTAS", etd: "", eta: "", airline: "", days: "" };
    setRows((r) => [...r, nr]);
    setEditRow(nr.flight);
    setEditForm({ ...nr });
  };

  const deleteRow = (f: string) => {
    const u = rows.filter((r) => r.flight !== f);
    setRows(u);
    
    const ns: FlightSchedule = {};
    u.forEach(({ flight, cutoff, dest, cto, etd, eta, airline, days }) => {
      ns[flight] = { cutoff, dest, cto, etd, eta, airline, days };
    });
    
    onChange(ns);
    if (editRow === f) {
      setEditRow(null);
    }
  };

  const ef = (k: keyof RowData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (!editForm) return;
    const val = e.target.value.toUpperCase();
    let nextForm = { ...editForm, [k]: val };
    if (k === "flight" && val.length >= 2) {
      const derived = getAirlineForFlight(val);
      if (derived && !editForm.airline) {
        nextForm.airline = derived;
      }
    }
    setEditForm(nextForm);
  };

  const downloadTemplate = () => {
    const headers = ["Airline", "Flight", "Days", "Cutoff", "Destination", "CTO", "ETD", "ETA"];
    
    const fileRows = [headers];
    rows.forEach((r) => {
      fileRows.push([
        r.airline || getAirlineForFlight(r.flight) || "",
        r.flight || "",
        r.days || "",
        r.cutoff || "",
        r.dest || "",
        r.cto || "",
        r.etd || "",
        r.eta || ""
      ]);
    });

    const csvContent = fileRows
      .map((r) => r.map((val) => `"${(val || "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flight_schedule_mass_update.csv";
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
          alert("CSV file appears empty or has no data headers.");
          return;
        }

        const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
        const colIdx = (key: string) => headers.indexOf(key);

        const getCell = (row: string[], key: string) => {
          const idx = colIdx(key);
          if (idx < 0) return "";
          return (row[idx] || "").trim().replace(/^"|"$/g, "");
        };

        const updatedRows: RowData[] = [...rows];
        let imported = 0;

        lines.slice(1).forEach((line) => {
          if (!line.trim()) return;

          const rawRow = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) || line.split(",");
          const cleanRow = rawRow.map((val) => val.trim().replace(/^"|"$/g, ""));

          const flight = getCell(cleanRow, "flight").toUpperCase();
          if (!flight) return;

          const airline = getCell(cleanRow, "airline") || getAirlineForFlight(flight);
          const days = getCell(cleanRow, "days").toUpperCase();
          const cutoff = getCell(cleanRow, "cutoff");
          const dest = (getCell(cleanRow, "destination") || getCell(cleanRow, "dest")).toUpperCase();
          const cto = getCell(cleanRow, "cto").toUpperCase() || "QANTAS";
          const etd = getCell(cleanRow, "etd");
          const eta = getCell(cleanRow, "eta");

          const existingIdx = updatedRows.findIndex((r) => r.flight === flight);
          const flightData: RowData = {
            flight,
            cutoff,
            dest,
            cto,
            etd,
            eta,
            airline,
            days
          };

          if (existingIdx >= 0) {
            updatedRows[existingIdx] = flightData;
          } else {
            updatedRows.push(flightData);
          }
          imported++;
        });

        if (imported === 0) {
          alert("No valid flight rows found in the CSV file.");
          return;
        }

        setRows(updatedRows);

        const ns: FlightSchedule = {};
        updatedRows.forEach(({ flight, cutoff, dest, cto, etd, eta, airline, days }) => {
          ns[flight] = { cutoff, dest, cto, etd, eta, airline, days };
        });
        onChange(ns);

        alert(`✓ Successfully imported/updated ${imported} flight schedules!`);
      } catch (err) {
        console.error(err);
        alert("Error parsing CSV schedule. Please make sure format matches template.");
      }
    };
    reader.readAsText(file);
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
          accept=".csv"
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
          title="Upload CSV to insert/update flight schedules in bulk"
        >
          <Upload size={14} /> Import CSV
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
          title="Get a pre-populated CSV template with all active flight items"
        >
          <Download size={14} /> Get CSV Template
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
            {filtered.map((r, i) =>
              editRow === r.flight && editForm ? (
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
                    <input
                      style={{ ...INP, width: 80 }}
                      value={editForm.cutoff}
                      onChange={ef("cutoff")}
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
                    />
                  </td>
                  <td style={{ padding: "5px 8px" }}>
                    <input
                      style={{ ...INP, width: 100 }}
                      value={editForm.eta}
                      onChange={ef("eta")}
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
                    background: getRowBgColor(r.cto, hoveredRow === r.flight, i),
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={() => setHoveredRow(r.flight)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  <td style={{ padding: "9px 12px", fontWeight: 700, color: T.accent }}>{r.airline || "—"}</td>
                  <td style={{ padding: "9px 12px", fontWeight: 700, color: "#000000" }}>{r.flight}</td>
                  <td style={{ padding: "9px 12px", fontFamily: "monospace", color: "#475569", fontWeight: 700 }}>
                    {r.days || "—"}
                  </td>
                  <td style={{ padding: "9px 12px", fontFamily: "monospace", color: "#000000", fontWeight: 700 }}>
                    {r.cutoff}
                  </td>
                  <td style={{ padding: "9px 12px", fontWeight: 700, color: "#000000" }}>{r.dest || "—"}</td>
                  <td style={{ padding: "9px 12px", color: "#000000", fontWeight: 500 }}>{r.cto}</td>
                  <td style={{ padding: "9px 12px", fontFamily: "monospace", color: "#000000" }}>{r.etd || "—"}</td>
                  <td style={{ padding: "9px 12px", fontFamily: "monospace", color: "#000000" }}>{r.eta || "—"}</td>
                  <td style={{ padding: "9px 12px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => openEdit(r)}
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
                        onClick={() => {
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
              )
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
};
