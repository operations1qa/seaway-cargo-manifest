import React, { useState, useRef } from "react";
import { Search, Plus, Save, Trash2, RotateCcw, Building2, MapPin, Phone, Mail, FileText, CheckCircle2, Clock, Download, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { CtoDirectory, CtoInfo } from "../types";
import { T } from "../utils/theme";
import { INITIAL_CTOS } from "../data/mockData";

interface CtoAdminProps {
  ctoDirectory: CtoDirectory;
  onChange: (updated: CtoDirectory) => void;
  isAdmin: boolean;
  selectedPort?: string;
}

export const CtoAdmin: React.FC<CtoAdminProps> = ({ ctoDirectory, onChange, isAdmin, selectedPort }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCto, setSelectedCto] = useState<string>(() => {
    const keys = Object.keys(ctoDirectory);
    return keys.length > 0 ? keys[0] : "";
  });
  
  // Edit form states
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [color, setColor] = useState("#0284c7");
  const [hours, setHours] = useState("");

  // Automatically select a valid CTO if the current selectedCto is empty or not in the directory
  React.useEffect(() => {
    const keys = Object.keys(ctoDirectory);
    if (!selectedCto || !ctoDirectory[selectedCto]) {
      if (keys.length > 0) {
        setSelectedCto(keys[0]);
      } else {
        setSelectedCto("");
      }
    }
  }, [ctoDirectory, selectedCto]);
  
  // Custom new CTO creation state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCtoName, setNewCtoName] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Custom alert and confirmation dialog states (prevents native browser blocks inside iframe)
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [ctoToDeleteState, setCtoToDeleteState] = useState<string | null>(null);
  const [ctoToResetState, setCtoToResetState] = useState<string | null>(null);

  const showAlert = (msg: string) => {
    setAlertMessage(msg);
  };

  const downloadCtoTemplate = () => {
    const headers = ["CTO NAME*", "HOURS OF OPERATION", "ADDRESS", "PHONE NUMBER", "EMAIL CONTACTS", "OPERATIONAL NOTES"];
    const exportRows = Object.entries(ctoDirectory).map(([name, info]) => [
      name,
      info.hours || "",
      info.address || "",
      info.phone || "",
      info.email || "",
      info.notes || ""
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...exportRows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "CTO_Directory");
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cto_directory_template.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCtoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
        if (rawRows.length < 2) {
          showAlert("File appears empty or has no data rows.");
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

        const updated = { ...ctoDirectory };
        let importedCount = 0;

        rawRows.slice(1).forEach((row) => {
          if (!row || row.length === 0) return;
          if (row.every(c => c === undefined || c === null || String(c).trim() === "")) return;

          const name = getCell(row, ["ctoname", "cto", "name"]).toUpperCase();
          if (!name) return;

          const hoursVal = getCell(row, ["hoursofoperation", "hours", "operationhours"]);
          const addressVal = getCell(row, ["address", "location"]);
          const phoneVal = getCell(row, ["phonenumber", "phone", "telephone"]);
          const emailVal = getCell(row, ["emailcontacts", "email", "emails"]);
          const notesVal = getCell(row, ["operationalnotes", "notes", "operationalnote"]);

          const existingCto = updated[name];

          updated[name] = {
            address: addressVal,
            phone: phoneVal,
            email: emailVal,
            notes: notesVal,
            color: existingCto?.color || "#0284c7",
            hours: hoursVal
          };
          importedCount++;
        });

        onChange(updated);
        showAlert(`Successfully imported ${importedCount} CTO entries!`);
      } catch (err: any) {
        showAlert("Error parsing Excel file. Ensure it is a valid Excel document with a list of CTO entries.");
        console.error(err);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  // Load selected CTO into form states when selectedCto changes
  React.useEffect(() => {
    if (selectedCto && ctoDirectory[selectedCto]) {
      const info = ctoDirectory[selectedCto];
      setAddress(info.address || "");
      setPhone(info.phone || "");
      setEmail(info.email || "");
      setNotes(info.notes || "");
      setColor(info.color || "#0284c7");
      setHours(info.hours || "");
    } else {
      setAddress("");
      setPhone("");
      setEmail("");
      setNotes("");
      setColor("#0284c7");
      setHours("");
    }
  }, [selectedCto, ctoDirectory]);

  // Handle Save
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCto) return;

    const updated = {
      ...ctoDirectory,
      [selectedCto]: {
        address: address.trim(),
        phone: phone.trim(),
        email: email.trim(),
        notes: notes.trim(),
        color: color,
        hours: hours.trim()
      }
    };

    onChange(updated);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  // Handle Add New Custom CTO
  const handleAddCto = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newCtoName.toUpperCase().trim();
    if (!cleanName) {
      showAlert("Please enter a valid name for the CTO.");
      return;
    }

    if (ctoDirectory[cleanName]) {
      showAlert(`"${cleanName}" already exists in the directory.`);
      return;
    }

    const updated = {
      ...ctoDirectory,
      [cleanName]: {
        address: "",
        phone: "",
        email: "",
        notes: "",
        color: "#0284c7",
        hours: ""
      }
    };

    onChange(updated);
    setSelectedCto(cleanName);
    setNewCtoName("");
    setShowAddModal(false);
  };

  // Perform actual deletion after state confirmation
  const executeDeleteCto = (ctoToDelete: string) => {
    const updated = { ...ctoDirectory };
    delete updated[ctoToDelete];
    onChange(updated);

    // Re-select another one
    const remaining = Object.keys(updated);
    if (remaining.length > 0) {
      setSelectedCto(remaining[0]);
    } else {
      setSelectedCto("");
    }
    setCtoToDeleteState(null);
  };

  // Perform actual reset after state confirmation
  const executeResetCto = (ctoName: string) => {
    const defaults = INITIAL_CTOS as Record<string, CtoInfo>;
    if (!defaults[ctoName]) return;

    const updated = {
      ...ctoDirectory,
      [ctoName]: { ...defaults[ctoName] }
    };
    onChange(updated);
    setCtoToResetState(null);
  };

  // Filter cto entries
  const filteredCtos = Object.keys(ctoDirectory).filter(name => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    
    const info = ctoDirectory[name];
    return (
      name.toLowerCase().includes(query) ||
      (info.email || "").toLowerCase().includes(query) ||
      (info.notes || "").toLowerCase().includes(query) ||
      (info.address || "").toLowerCase().includes(query) ||
      (info.phone || "").toLowerCase().includes(query)
    );
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      

      {/* Header Panel with search & add */}
      <div style={{
        background: T.surface,
        border: "1px solid #e2e8f0",
        borderRadius: "16px",
        padding: "12px 18px",
        display: "flex",
        gap: "12px",
        alignItems: "center",
        justifyContent: "space-between",
        boxShadow: "0 8px 24px rgba(0,0,0,0.02)",
        flexWrap: "wrap"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: "1 1 300px", position: "relative" }}>
          <Search size={18} style={{ color: T.textMuted, position: "absolute", left: "12px" }} />
          <input
            id="cto-search-input"
            type="text"
            placeholder="Search CTO contacts, notes or addresses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "full",
              flex: 1,
              padding: "8px 12px 8px 36px",
              border: "1px solid #cbd5e1",
              borderRadius: "10px",
              outline: "none",
              fontSize: "13px"
            }}
          />
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          {/* Invisible file input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportCtoFile}
            accept=".xlsx, .xls"
            style={{ display: "none" }}
          />

          <button
            id="download-cto-template-btn"
            onClick={downloadCtoTemplate}
            style={{
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              color: T.text,
              padding: "8px 14px",
              borderRadius: "10px",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
            }}
          >
            <Download size={15} /> Download Template
          </button>

          <button
            id="import-cto-template-btn"
            onClick={() => fileInputRef.current?.click()}
            style={{
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              color: T.text,
              padding: "8px 14px",
              borderRadius: "10px",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
            }}
          >
            <Upload size={15} /> Import CTO
          </button>

          <button
            id="add-custom-cto-btn"
            onClick={() => setShowAddModal(true)}
            style={{
              background: T.accent,
              color: "#ffffff",
              padding: "8px 16px",
              borderRadius: "10px",
              fontWeight: 800,
              fontSize: "13px",
              border: "none",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 4px 6px -1px rgba(0,113,227,0.15)"
            }}
          >
            <Plus size={16} /> Add Custom CTO
          </button>
        </div>
      </div>

      {/* Main Body Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
        
        {/* Left Panel: List of CTOs */}
        <div style={{
          background: T.surface,
          border: "1px solid #e2e8f0",
          borderRadius: "18px",
          padding: "16px",
          boxShadow: "0 4px 6px -1px rgba(0,0,0,0.01)",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          maxHeight: "550px",
          overflowY: "auto"
        }}>
          <span style={{ fontSize: "14px", fontWeight: 800, color: "#1e293b", borderBottom: "1px solid #f1f5f9", paddingBottom: "8px" }}>
            🏢 Cargo Terminal Operators ({filteredCtos.length})
          </span>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {filteredCtos.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 10px", color: T.textMuted, fontSize: "13px" }}>
                No CTO directory records found.
              </div>
            ) : (
              filteredCtos.map((name) => {
                const isSelected = selectedCto === name;
                const info = ctoDirectory[name];
                const isBuiltIn = name in (INITIAL_CTOS as Record<string, any>);

                return (
                  <div
                    key={name}
                    onClick={() => setSelectedCto(name)}
                    style={{
                      padding: "12px 14px 12px 10px",
                      borderRadius: "12px",
                      borderStyle: "solid",
                      borderWidth: isSelected ? "2px 2px 2px 5px" : "1px 1px 1px 5px",
                      borderColor: isSelected 
                        ? `${T.accent} ${T.accent} ${T.accent} ${info.color || "#cbd5e1"}`
                        : `#cbd5e1 #cbd5e1 #cbd5e1 ${info.color || "#cbd5e1"}`,
                      background: isSelected ? T.accentBg : "#ffffff",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "14px", fontWeight: 900, color: isSelected ? T.accent : "#0f172a" }}>
                        {name}
                      </span>
                      <div style={{ display: "flex", gap: "6px" }}>
                        {isBuiltIn ? (
                          <span style={{ fontSize: "9px", background: "#f1f5f9", color: "#64748b", padding: "1px 6px", borderRadius: "8px", fontWeight: 700 }}>
                            SYSTEM
                          </span>
                        ) : (
                          <span style={{ fontSize: "9px", background: "#fef3c7", color: "#d97706", padding: "1px 6px", borderRadius: "8px", fontWeight: 700 }}>
                            CUSTOM
                          </span>
                        )}
                      </div>
                    </div>

                    {info.email && (
                      <span style={{ fontSize: "11px", color: T.textMid, display: "flex", alignItems: "center", gap: "4px" }}>
                        <Mail size={11} /> {info.email}
                      </span>
                    )}
                    {info.phone && (
                      <span style={{ fontSize: "11px", color: T.textMid, display: "flex", alignItems: "center", gap: "4px" }}>
                        <Phone size={11} /> {info.phone}
                      </span>
                    )}
                    {info.hours && (
                      <span style={{ fontSize: "11px", color: T.textMid, display: "flex", alignItems: "center", gap: "4px" }}>
                        <Clock size={11} /> {info.hours}
                      </span>
                    )}
                    
                    {info.notes && (
                      <p style={{
                        fontSize: "11px",
                        color: T.textMuted,
                        margin: 0,
                        textOverflow: "ellipsis",
                        overflow: "hidden",
                        whiteSpace: "nowrap"
                      }}>
                        📝 {info.notes}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel: Selected CTO Editor */}
        <div style={{
          background: T.surface,
          border: "1px solid #e2e8f0",
          borderRadius: "18px",
          padding: "20px",
          boxShadow: "0 4px 6px -1px rgba(0,0,0,0.01)"
        }}>
          {!selectedCto ? (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", color: T.textMuted, padding: "80px 0" }}>
              <Building2 size={48} style={{ color: "#cbd5e1", marginBottom: "12px" }} />
              <span style={{ fontSize: "14px", fontWeight: 600 }}>No Operator Selected</span>
              <p style={{ fontSize: "11px", margin: "4px 0 0 0", textAlign: "center" }}>Select or add a cargo terminal operator on the left to manage details.</p>
            </div>
          ) : (
            <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9", paddingBottom: "10px" }}>
                <div>
                  <span style={{ fontSize: "11px", color: T.textMuted, fontWeight: 700, textTransform: "uppercase" }}>Editing Details For</span>
                  <h4 style={{ fontSize: "18px", fontWeight: 900, color: "#0f172a", margin: 0 }}>{selectedCto}</h4>
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  {selectedCto in (INITIAL_CTOS as Record<string, any>) ? (
                    <button
                      type="button"
                      onClick={() => setCtoToResetState(selectedCto)}
                      title="Reset details to system default values"
                      style={{
                        background: "#f1f5f9",
                        color: "#475569",
                        border: "1px solid #cbd5e1",
                        borderRadius: "8px",
                        padding: "6px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center"
                      }}
                    >
                      <RotateCcw size={14} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCtoToDeleteState(selectedCto)}
                      title="Remove custom operator"
                      style={{
                        background: "#ffe1e1",
                        color: T.red,
                        border: "1px solid #fecaca",
                        borderRadius: "8px",
                        padding: "6px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center"
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Physical Address */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "11px", fontWeight: 800, color: "#475569", display: "flex", alignItems: "center", gap: "4px" }}>
                  <MapPin size={13} /> Physical Address
                </label>
                <input
                  type="text"
                  placeholder="Street, Suburb, Postcode, City"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  style={{
                    padding: "10px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "10px",
                    outline: "none",
                    fontSize: "13px"
                  }}
                />
              </div>

              {/* Contact Phone & Email Row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "11px", fontWeight: 800, color: "#475569", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Phone size={13} /> Phone Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. +61 3 9000 0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    style={{
                      padding: "10px",
                      border: "1px solid #cbd5e1",
                      borderRadius: "10px",
                      outline: "none",
                      fontSize: "13px",
                      width: "100%"
                    }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "11px", fontWeight: 800, color: "#475569", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Mail size={13} /> Contact Email
                  </label>
                  <input
                    type="email"
                    placeholder="e.g. mel.cargo@operator.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{
                      padding: "10px",
                      border: "1px solid #cbd5e1",
                      borderRadius: "10px",
                      outline: "none",
                      fontSize: "13px",
                      width: "100%"
                    }}
                  />
                </div>
              </div>

              {/* Hours of Operation & Color Row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "11px", fontWeight: 800, color: "#475569", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Clock size={13} /> Hours of Operation
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 06:00 - 23:30, or 24 Hours"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    style={{
                      padding: "10px",
                      border: "1px solid #cbd5e1",
                      borderRadius: "10px",
                      outline: "none",
                      fontSize: "13px",
                      width: "100%"
                    }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "11px", fontWeight: 800, color: "#475569", display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", backgroundColor: color, border: "1px solid #94a3b8" }}></span>
                    Schedule Highlight Color
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", height: "38px" }}>
                    {/* Presets */}
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      {["#ef4444", "#0284c7", "#22c55e", "#8b5cf6", "#f59e0b", "#ec4899", "#64748b"].map((pCol) => {
                        const isSel = color.toLowerCase() === pCol.toLowerCase();
                        return (
                          <button
                            key={pCol}
                            type="button"
                            onClick={() => setColor(pCol)}
                            style={{
                              width: "22px",
                              height: "22px",
                              borderRadius: "50%",
                              backgroundColor: pCol,
                              border: isSel ? "2px solid #0f172a" : "1px solid #cbd5e1",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: 0,
                              boxShadow: isSel ? "0 0 4px rgba(0,0,0,0.2)" : "none",
                              transition: "transform 0.15s ease"
                            }}
                            title={pCol}
                          >
                            {isSel && (
                              <span style={{ color: "#ffffff", fontSize: "9px", fontWeight: "bold" }}>✓</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {/* Custom Picker */}
                    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        style={{
                          width: "26px",
                          height: "26px",
                          padding: 0,
                          border: "1px solid #cbd5e1",
                          borderRadius: "4px",
                          cursor: "pointer",
                          background: "none"
                        }}
                        title="Custom Color"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Operational & Lodgment Notes */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "11px", fontWeight: 800, color: "#475569", display: "flex", alignItems: "center", gap: "4px" }}>
                  <FileText size={13} /> Operational & Lodgment Notes
                </label>
                <textarea
                  rows={4}
                  placeholder="Enter lodgment instructions, key personnel notes, and operating hours..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{
                    padding: "10px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "10px",
                    outline: "none",
                    fontSize: "13px",
                    fontFamily: "inherit",
                    resize: "vertical"
                  }}
                />
              </div>

              {/* Submit Buttons / Feedback */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "10px" }}>
                <div>
                  {saveSuccess && (
                    <span style={{ fontSize: "12px", color: T.green, fontWeight: 700, display: "flex", alignItems: "center", gap: "4px" }}>
                      <CheckCircle2 size={14} /> Saved successfully!
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => setCtoToDeleteState(selectedCto)}
                    style={{
                      background: "#ef4444",
                      color: "#ffffff",
                      padding: "10px 16px",
                      borderRadius: "10px",
                      fontWeight: 800,
                      fontSize: "13px",
                      border: "none",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      boxShadow: "0 4px 6px -1px rgba(239,68,68,0.15)"
                    }}
                  >
                    <Trash2 size={16} /> Delete Operator
                  </button>

                  <button
                    type="submit"
                    style={{
                      background: T.green,
                      color: "#ffffff",
                      padding: "10px 20px",
                      borderRadius: "10px",
                      fontWeight: 800,
                      fontSize: "13px",
                      border: "none",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      boxShadow: "0 4px 6px -1px rgba(52,199,89,0.15)"
                    }}
                  >
                    <Save size={16} /> Save CTO Details
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Modal: Create custom operator */}
      {showAddModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(15,23,42,0.4)",
          backdropFilter: "blur(4px)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 1000,
          padding: "16px"
        }}>
          <div style={{
            background: "#ffffff",
            borderRadius: "16px",
            border: "1px solid #cbd5e1",
            boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
            width: "100%",
            maxWidth: "400px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "14px"
          }}>
            <h4 style={{ fontSize: "16px", fontWeight: 900, color: "#0f172a", margin: 0 }}>
              🏢 Add Custom Cargo Operator
            </h4>

            <form onSubmit={handleAddCto} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>
                  Operator/CTO Name (UPPERCASE)
                </label>
                <input
                  type="text"
                  placeholder="e.g. DNATA SYDNEY"
                  value={newCtoName}
                  onChange={(e) => setNewCtoName(e.target.value)}
                  autoFocus
                  style={{
                    padding: "10px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "10px",
                    outline: "none",
                    fontSize: "13px",
                    textTransform: "uppercase"
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{
                    background: "#f1f5f9",
                    color: "#475569",
                    padding: "8px 14px",
                    borderRadius: "10px",
                    fontWeight: 700,
                    fontSize: "13px",
                    border: "1px solid #cbd5e1",
                    cursor: "pointer"
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    background: T.accent,
                    color: "#ffffff",
                    padding: "8px 14px",
                    borderRadius: "10px",
                    fontWeight: 800,
                    fontSize: "13px",
                    border: "none",
                    cursor: "pointer"
                  }}
                >
                  Create CTO
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delete Confirmation */}
      {ctoToDeleteState && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(15,23,42,0.4)",
          backdropFilter: "blur(4px)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 1001,
          padding: "16px"
        }}>
          <div style={{
            background: "#ffffff",
            borderRadius: "16px",
            border: "1px solid #cbd5e1",
            boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
            width: "100%",
            maxWidth: "400px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "14px"
          }}>
            <h4 style={{ fontSize: "16px", fontWeight: 900, color: "#ef4444", margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
              <Trash2 size={18} /> Delete Cargo Operator?
            </h4>
            <p style={{ fontSize: "13px", color: "#475569", margin: 0, lineHeight: "1.5" }}>
              Are you sure you want to remove <strong>"{ctoToDeleteState}"</strong> from the directory?
              This will permanently delete their contact details, operation hours, and notes.
            </p>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "8px" }}>
              <button
                type="button"
                onClick={() => setCtoToDeleteState(null)}
                style={{
                  background: "#f1f5f9",
                  color: "#475569",
                  padding: "8px 14px",
                  borderRadius: "10px",
                  fontWeight: 700,
                  fontSize: "13px",
                  border: "1px solid #cbd5e1",
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeDeleteCto(ctoToDeleteState)}
                style={{
                  background: "#ef4444",
                  color: "#ffffff",
                  padding: "8px 14px",
                  borderRadius: "10px",
                  fontWeight: 800,
                  fontSize: "13px",
                  border: "none",
                  cursor: "pointer"
                }}
              >
                Delete Operator
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reset Confirmation */}
      {ctoToResetState && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(15,23,42,0.4)",
          backdropFilter: "blur(4px)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 1001,
          padding: "16px"
        }}>
          <div style={{
            background: "#ffffff",
            borderRadius: "16px",
            border: "1px solid #cbd5e1",
            boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
            width: "100%",
            maxWidth: "400px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "14px"
          }}>
            <h4 style={{ fontSize: "16px", fontWeight: 900, color: "#0f172a", margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
              <RotateCcw size={18} /> Reset to System Defaults?
            </h4>
            <p style={{ fontSize: "13px", color: "#475569", margin: 0, lineHeight: "1.5" }}>
              Are you sure you want to reset <strong>"{ctoToResetState}"</strong> back to the system default values?
            </p>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "8px" }}>
              <button
                type="button"
                onClick={() => setCtoToResetState(null)}
                style={{
                  background: "#f1f5f9",
                  color: "#475569",
                  padding: "8px 14px",
                  borderRadius: "10px",
                  fontWeight: 700,
                  fontSize: "13px",
                  border: "1px solid #cbd5e1",
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeResetCto(ctoToResetState)}
                style={{
                  background: T.accent,
                  color: "#ffffff",
                  padding: "8px 14px",
                  borderRadius: "10px",
                  fontWeight: 800,
                  fontSize: "13px",
                  border: "none",
                  cursor: "pointer"
                }}
              >
                Reset Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Custom Alert Dialog */}
      {alertMessage && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(15,23,42,0.4)",
          backdropFilter: "blur(4px)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 1002,
          padding: "16px"
        }}>
          <div style={{
            background: "#ffffff",
            borderRadius: "16px",
            border: "1px solid #cbd5e1",
            boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
            width: "100%",
            maxWidth: "400px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "14px"
          }}>
            <h4 style={{ fontSize: "16px", fontWeight: 900, color: "#0f172a", margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
              ℹ️ Notification
            </h4>
            <p style={{ fontSize: "13px", color: "#475569", margin: 0, lineHeight: "1.5" }}>
              {alertMessage}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
              <button
                type="button"
                onClick={() => setAlertMessage(null)}
                style={{
                  background: T.accent,
                  color: "#ffffff",
                  padding: "8px 20px",
                  borderRadius: "10px",
                  fontWeight: 800,
                  fontSize: "13px",
                  border: "none",
                  cursor: "pointer"
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
