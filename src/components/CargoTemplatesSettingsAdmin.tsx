import React, { useState, useEffect } from "react";
import { Plus, Edit, Trash2, Save, X, ArrowLeft, Sparkles, FileText, Globe } from "lucide-react";
import { collection, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";

// Initial set of default instruction templates (now empty so they start clean and delete correctly)
const DEFAULT_INSTRUCTION_TEMPLATES: any[] = [];

interface CargoTemplatesSettingsAdminProps {
  currentUser: any;
  isAdmin: boolean;
  selectedPort: string;
  offlineMode: boolean;
}

export function CargoTemplatesSettingsAdmin({
  currentUser,
  isAdmin,
  selectedPort,
  offlineMode
}: CargoTemplatesSettingsAdminProps) {
  const [templates, setTemplates] = useState<{ id: string; name: string; text: string; port: string; ownerId?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  
  // UI views and fields state
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [portInput, setPortInput] = useState(selectedPort);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [activeFilterPort, setActiveFilterPort] = useState<string>(isAdmin ? "ALL" : selectedPort);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Sync templates
  useEffect(() => {
    if (offlineMode) {
      const saved = localStorage.getItem("SEAWAY_CARGO_TEMPLATES_V3");
      if (saved) {
        try {
          setTemplates(JSON.parse(saved));
        } catch (e) {
          console.error("Error parsing templates:", e);
        }
      } else {
        setTemplates([]);
        localStorage.setItem("SEAWAY_CARGO_TEMPLATES_V3", JSON.stringify([]));
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = onSnapshot(collection(db, "cargo_templates"), (snapshot) => {
      const fetched: any[] = [];
      snapshot.forEach((snapshotDoc) => {
        fetched.push({ id: snapshotDoc.id, ...snapshotDoc.data() });
      });
      setTemplates(fetched);
      localStorage.setItem("SEAWAY_CARGO_TEMPLATES_V3", JSON.stringify(fetched));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "cargo_templates");
      const saved = localStorage.getItem("SEAWAY_CARGO_TEMPLATES_V3");
      if (saved) {
        try {
          setTemplates(JSON.parse(saved));
        } catch (e) {
          // ignore
        }
      }
      setLoading(false);
    });

    return () => unsub();
  }, [offlineMode, currentUser]);

  // Keep portInput synced to currently selected port if not admin
  useEffect(() => {
    if (!isAdmin) {
      setPortInput(selectedPort);
      setActiveFilterPort(selectedPort);
    }
  }, [selectedPort, isAdmin]);

  const handleCreateNewClick = () => {
    setIsEditing(true);
    setEditId(null);
    setNameInput("");
    setTextInput("");
    setPortInput(selectedPort);
    setErrorMsg("");
    setSuccessMsg("");
  };

  const handleEditClick = (tmpl: any) => {
    setIsEditing(true);
    setEditId(tmpl.id);
    setNameInput(tmpl.name);
    setTextInput(tmpl.text);
    setPortInput(tmpl.port || selectedPort);
    setErrorMsg("");
    setSuccessMsg("");
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditId(null);
    setNameInput("");
    setTextInput("");
    setErrorMsg("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!nameInput.trim()) {
      setErrorMsg("Template Label is required.");
      return;
    }
    if (!textInput.trim()) {
      setErrorMsg("Instruction details of the template are required.");
      return;
    }

    const tPort = (isAdmin ? portInput : selectedPort).toUpperCase();
    const cleanId = editId || `${tPort.toLowerCase()}_${Date.now()}`;
    const newTmpl = {
      id: cleanId,
      name: nameInput.trim(),
      text: textInput.trim().toUpperCase(),
      port: tPort,
      ownerId: currentUser?.uid || "system",
      updatedAt: new Date().toISOString()
    };

    if (offlineMode) {
      const updated = editId
        ? templates.map((t) => (t.id === editId ? newTmpl : t))
        : [...templates, newTmpl];
      setTemplates(updated);
      localStorage.setItem("SEAWAY_CARGO_TEMPLATES_V3", JSON.stringify(updated));
      setSuccessMsg(editId ? "Template updated successfully!" : "New template created successfully!");
      setIsEditing(false);
    } else {
      try {
        await setDoc(doc(db, "cargo_templates", cleanId), newTmpl);
        setSuccessMsg(editId ? "Template synchronized to Cloud successfully!" : "Template added to Cloud database successfully!");
        setIsEditing(false);
      } catch (err) {
        console.error("Error saving to Firestore:", err);
        setErrorMsg("Failed to synchronize template to cloud database.");
      }
    }
  };

  const handleDelete = async (id: string) => {
    setErrorMsg("");
    setSuccessMsg("");
    if (offlineMode) {
      const updated = templates.filter((t) => t.id !== id);
      setTemplates(updated);
      localStorage.setItem("SEAWAY_CARGO_TEMPLATES_V3", JSON.stringify(updated));
      setSuccessMsg("Template deleted from local cache.");
      setConfirmDeleteId(null);
    } else {
      try {
        await deleteDoc(doc(db, "cargo_templates", id));
        setSuccessMsg("Template deleted from Cloud database successfully.");
        setConfirmDeleteId(null);
      } catch (err) {
        console.error("Error deleting template:", err);
        setErrorMsg("Failed to delete the template from the database.");
      }
    }
  };

  const filteredTemplates = templates.filter((t) => {
    // Port filter
    const matchesPort = activeFilterPort === "ALL" || (t.port || "").toUpperCase() === activeFilterPort.toUpperCase();
    
    // Search query filter
    const query = searchQuery.toLowerCase().trim();
    if (!query) return matchesPort;
    
    const matchesSearch =
      (t.name || "").toLowerCase().includes(query) ||
      (t.text || "").toLowerCase().includes(query) ||
      (t.port || "").toLowerCase().includes(query);
      
    return matchesPort && matchesSearch;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <h3 id="templates-settings-subheading" style={{ fontSize: "14px", fontWeight: 800, color: "#0f172a", margin: "4px 0 2px 2px", paddingBottom: "6px", borderBottom: "2px solid #e2e8f0", textTransform: "uppercase", letterSpacing: "0.5px" }}>
        📋 Loadsheet Cargo Templates
      </h3>
      
      <div style={{ background: "#ffffff", borderRadius: "18px", border: "1px solid #e2e8f0", padding: "24px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.02)" }}>
        
        {errorMsg && (
          <div style={{ padding: "10px 14px", background: "#fef2f2", color: "#b91c1c", borderRadius: "10px", fontSize: "12px", fontWeight: 700, border: "1px solid #fee2e2", marginBottom: "16px" }}>
            ❌ {errorMsg}
          </div>
        )}

        {successMsg && (
          <div style={{ padding: "10px 14px", background: "#f0fdf4", color: "#166534", borderRadius: "10px", fontSize: "12px", fontWeight: 700, border: "1px solid #dcfce7", marginBottom: "16px" }}>
            ✅ {successMsg}
          </div>
        )}

        {isEditing ? (
          /* Create / Edit Form UI */
          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px" }}>
              <button
                type="button"
                onClick={handleCancel}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "12px",
                  fontWeight: 750,
                  color: "#0284c7"
                }}
              >
                <ArrowLeft size={14} /> Back to templates list
              </button>
              <span style={{ fontSize: "13px", fontWeight: 800, color: "#1e293b", textTransform: "uppercase" }}>
                {editId ? "✏️ Edit Cargo Template" : "➕ Setup New Cargo Template"}
              </span>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "4px" }}>
                Template label / icon:
              </label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="e.g. 🌡️ Temp Sensitive Priority"
                style={{ width: "100%", padding: "10px 12px", fontSize: "13px", border: "1.5px solid #000000", borderRadius: "8px", outline: "none", boxSizing: "border-box" }}
              />
              <p style={{ margin: "4px 0 0 0", fontSize: "10px", color: "#64748b" }}>
                Give the template a short recognizable title (with an emoji icon for clear visual identity).
              </p>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "4px" }}>
                Port associated:
              </label>
              {isAdmin ? (
                <select
                  value={portInput}
                  onChange={(e) => setPortInput(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", fontSize: "13px", border: "1.5px solid #000000", borderRadius: "8px", cursor: "pointer", outline: "none", background: "#ffffff" }}
                >
                  {["ALL", "MEL", "SYD", "BNE", "CNS", "PER", "ADL"].map((st) => (
                    <option key={st} value={st}>{st === "ALL" ? "ALL PORTS (GLOBAL TEMPLATE)" : `${st} PORT HUBS`}</option>
                  ))}
                </select>
              ) : (
                <div style={{ padding: "10px 12px", fontSize: "13px", border: "1px solid #cbd5e1", borderRadius: "8px", background: "#f8fafc", color: "#64748b", fontWeight: 700 }}>
                  📌 Locked to your active operational port: {selectedPort}
                </div>
              )}
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "4px" }}>
                Special instructions (Will insert directly into Loadsheet loadsheet SOP instruction text area):
              </label>
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="E.G. NOTIFY RAMP TO POSITION NEAR Pit DOOR. DO NOT BLOCK AIR FLOW VENTILATOR GRATE..."
                rows={4}
                style={{ width: "100%", padding: "12px", fontSize: "13px", border: "1.5px solid #000000", borderRadius: "8px", outline: "none", resize: "none", fontFamily: "monospace", boxSizing: "border-box" }}
              />
              <p style={{ margin: "4px 0 0 0", fontSize: "10px", color: "#64748b" }}>
                Instructions will be automatically UPPERCASED upon insertion for official aviation dispatch logs.
              </p>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
              <button
                type="submit"
                style={{
                  flex: 1,
                  padding: "10px 16px",
                  borderRadius: "10px",
                  border: "none",
                  backgroundColor: "#22c55e",
                  color: "#ffffff",
                  fontSize: "12px",
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px"
                }}
              >
                <Save size={14} /> Save Template
              </button>
              <button
                type="button"
                onClick={handleCancel}
                style={{
                  padding: "10px 16px",
                  borderRadius: "10px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: "#ffffff",
                  color: "#475569",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          /* List and Manage View */
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
              <span style={{ fontSize: "13px", fontWeight: 800, color: "#475569", textTransform: "uppercase" }}>
                {activeFilterPort === "ALL" ? "🌍 Showing templates for all active Australian airports" : `📍 PORT ASSOCIATED TEMPLATES LIST: ${activeFilterPort}`}
              </span>
              <button
                type="button"
                onClick={handleCreateNewClick}
                style={{
                  padding: "8px 16px",
                  borderRadius: "10px",
                  backgroundColor: "#000000",
                  color: "#ffffff",
                  fontSize: "12px",
                  fontWeight: 800,
                  border: "none",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <Plus size={14} /> Create Template
              </button>
            </div>

            {/* Filters bar */}
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", background: "#f8fafc", padding: "10px", borderRadius: "10px", border: "1px solid #f1f5f9" }}>
              <input
                type="text"
                placeholder="🔍 Search saved templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ flex: 1, minWidth: "160px", padding: "6px 12px", fontSize: "12px", border: "1px solid #cbd5e1", borderRadius: "6px", outline: "none" }}
              />
              
              {isAdmin && (
                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                  {["ALL", "MEL", "SYD", "BNE", "CNS", "PER", "ADL"].map((portOption) => (
                    <button
                      key={portOption}
                      type="button"
                      onClick={() => setActiveFilterPort(portOption)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "6px",
                        border: "1px solid",
                        borderColor: activeFilterPort === portOption ? "#0284c7" : "#cbd5e1",
                        fontSize: "11px",
                        fontWeight: 800,
                        backgroundColor: activeFilterPort === portOption ? "#e0f2fe" : "#ffffff",
                        color: activeFilterPort === portOption ? "#0369a1" : "#475569",
                        cursor: "pointer"
                      }}
                    >
                      {portOption}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {loading ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#64748b", fontSize: "13px", fontWeight: "700" }}>
                ⏳ Connecting to Firestore cargo template synchronization stream...
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px" }}>
                {filteredTemplates.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    style={{
                      border: "2px solid #000000",
                      borderRadius: "10px",
                      padding: "14px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      background: "#ffffff",
                      gap: "12px",
                      boxShadow: "3px 3px 0px rgba(0,0,0,1)",
                      position: "relative"
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                        <span style={{ fontSize: "13px", fontWeight: "950", color: "#000000" }}>{tmpl.name}</span>
                        <span style={{ fontSize: "9px", fontWeight: "900", background: "#f1f5f9", color: "#334155", padding: "1px 5px", border: "1.5px solid #000000", borderRadius: "4px" }}>
                          {tmpl.port || "ALL"}
                        </span>
                      </div>
                      <div style={{ fontSize: "11px", fontFamily: "monospace", color: "#1e293b", background: "#f8fafc", padding: "8px 10px", borderRadius: "6px", border: "1.5px solid #cbd5e1", lineHeight: "1.4" }}>
                        {tmpl.text}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => handleEditClick(tmpl)}
                        style={{
                          padding: "6px",
                          borderRadius: "6px",
                          border: "1.5px solid #000000",
                          backgroundColor: "#ffffff",
                          color: "#000000",
                          cursor: "pointer"
                        }}
                        title="Edit template label or content details"
                      >
                        <Edit size={12} />
                      </button>

                      {confirmDeleteId === tmpl.id ? (
                        <div style={{ display: "flex", gap: "3px", alignItems: "center" }}>
                          <button
                            type="button"
                            onClick={() => handleDelete(tmpl.id)}
                            style={{
                              padding: "4px 8px",
                              borderRadius: "6px",
                              backgroundColor: "#dc2626",
                              color: "#ffffff",
                              fontSize: "11px",
                              fontWeight: 800,
                              border: "none",
                              cursor: "pointer"
                            }}
                          >
                            YES DELETE
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            style={{
                              padding: "4px 8px",
                              borderRadius: "6px",
                              backgroundColor: "#64748b",
                              color: "#ffffff",
                              fontSize: "11px",
                              fontWeight: 800,
                              border: "none",
                              cursor: "pointer"
                            }}
                          >
                            NO
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(tmpl.id)}
                          style={{
                            padding: "6px",
                            borderRadius: "6px",
                            border: "1.5px solid #dc2626",
                            backgroundColor: "#fef2f2",
                            color: "#dc2626",
                            cursor: "pointer"
                          }}
                          title="Delete this template form"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {filteredTemplates.length === 0 && (
                  <div style={{ border: "2px dashed #cbd5e1", borderRadius: "10px", padding: "30px", textShadow: "none", fontSize: "12.5px", color: "#64748b", textAlign: "center" }}>
                    No templates match your selection. Click "Create Template" to get started!
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
