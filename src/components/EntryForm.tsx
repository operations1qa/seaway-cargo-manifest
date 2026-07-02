/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Shipment, FlightSchedule, CtoDirectory } from "../types";
import { T, INP, SEL } from "../utils/theme";
import { toDisplay, todayStr, subtractHour, getAvailableCtos, formatAwb } from "../utils/helpers";
import { Field } from "./UIAtoms";

interface EntryFormProps {
  initial: Shipment | null;
  onSave: (form: Shipment) => void;
  onCancel: () => void;
  schedule: FlightSchedule;
  onGoToFlights?: () => void;
  ctoDirectory?: CtoDirectory;
  station?: string;
}

const BLANK: Omit<Shipment, "id"> = {
  cutoff: "",
  date: "",
  shipper: "",
  awb: "",
  flight: "",
  cto: "",
  uld: "",
  ice: "",
  dest: "",
  commodity: "",
  unitNum: "",
  specialInst: "",
  scr: "YES",
  operator: "",
  loadType: "UNIT",
  jobRef: "",
  consolRef: "",
  eta: "",
  etd: "",
  complete: false,
};

const formatTypedDate = (val: string): string => {
  if (!val) return "";
  const clean = val.replace(/\D/g, "").slice(0, 8);
  if (clean.length >= 5) {
    return `${clean.slice(0, 2)}/${clean.slice(2, 4)}/${clean.slice(4)}`;
  } else if (clean.length >= 3) {
    return `${clean.slice(0, 2)}/${clean.slice(2)}`;
  }
  return clean;
};

export const EntryForm: React.FC<EntryFormProps> = ({
  initial,
  onSave,
  onCancel,
  schedule,
  onGoToFlights,
  ctoDirectory,
  station,
}) => {
  const availableCtos = React.useMemo(() => {
    if (!ctoDirectory) return [];
    return Object.keys(ctoDirectory).map(k => k.trim().toUpperCase()).sort();
  }, [ctoDirectory]);

  const dateInputRef = React.useRef<HTMLInputElement | null>(null);
  
  const [form, setForm] = useState<Shipment>(() => {
    if (initial) {
      return { ...initial };
    }
    return { ...BLANK, date: todayStr(station), id: 0 } as Shipment;
  });

  const [isOther, setIsOther] = useState(() => {
    const defaultCtos = ctoDirectory ? Object.keys(ctoDirectory).map(k => k.trim().toUpperCase()) : [];
    if (initial && initial.cto) {
      const val = initial.cto.trim().toUpperCase();
      return val && !defaultCtos.includes(val);
    }
    return false;
  });

  const [hint, setHint] = useState("");
  const [showMismatchConfirm, setShowMismatchConfirm] = useState(false);
  const [dateInput, setDateInput] = useState(() => formatTypedDate(initial?.date || todayStr(station)));

  const checkDayMismatch = (flightCode: string, dateStr: string) => {
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
      const dayName = weekdays[jsDay];
      return {
        dayName,
        flightCode: flightCode.toUpperCase(),
        daysConfig: sched.days || "No days allocated",
      };
    }
    return null;
  };

  const dayMismatch = checkDayMismatch(form.flight, form.date);

  const set = (k: keyof Shipment) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    let val = e.target.value.toUpperCase();
    if (k === "awb") {
      val = formatAwb(val, form.awb);
    }
    setForm((f) => ({ ...f, [k]: val }));
  };

  const handleCtoSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value.toUpperCase();
    if (val === "OTHER") {
      setIsOther(true);
      setForm((f) => ({ ...f, cto: "" }));
    } else {
      setIsOther(false);
      setForm((f) => ({ ...f, cto: val }));
    }
  };

  const handleFlight = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();
    const sched = schedule[val];
    if (sched) {
      const co = form.loadType === "LOOSE" ? (sched.looseCutoffExempt ? (sched.looseCutoffTime || sched.cutoff) : (subtractHour(sched.cutoff) || sched.cutoff)) : sched.cutoff;
      const schedCto = sched.cto || "";
      const isCustomCto = schedCto && !availableCtos.includes(schedCto.trim().toUpperCase());
      setIsOther(!!isCustomCto);
      setForm((f) => ({
        ...f,
        flight: val,
        cutoff: co,
        dest: f.dest || sched.dest,
        cto: schedCto,
        etd: sched.etd || "",
        eta: sched.eta || "",
      }));
      setHint(
        `✓ Cutoff: ${co || "—"} · CTO: ${sched.cto} · Origin: ${sched.origin || "MEL"} · Dest: ${sched.dest || "—"}${form.loadType === "LOOSE" ? (sched.looseCutoffExempt ? " (Exempt LOOSE)" : " (−1hr LOOSE)") : ""}`
      );
    } else {
      setForm((f) => ({ ...f, flight: val }));
      setHint(val.length >= 3 ? "Not in schedule — enter manually" : "");
    }
  };

  const handleLoadType = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const lt = e.target.value;
    const sched = schedule[form.flight];
    if (sched) {
      const co = lt === "LOOSE" ? (sched.looseCutoffExempt ? (sched.looseCutoffTime || sched.cutoff) : (subtractHour(sched.cutoff) || sched.cutoff)) : sched.cutoff;
      setForm((f) => ({
        ...f,
        loadType: lt,
        cutoff: co,
      }));
      setHint(`✓ Cutoff: ${co} ${lt === "LOOSE" ? (sched.looseCutoffExempt ? "(Exempt)" : "(−1hr)") : ""}`);
    } else {
      setForm((f) => ({ ...f, loadType: lt }));
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDateInput(val);
    const digits = val.replace(/\D/g, "").slice(0, 8);
    setForm((f) => ({ ...f, date: digits }));
  };

  const handleDateBlur = () => {
    const digits = dateInput.replace(/\D/g, "");
    if (digits.length === 8) {
      const formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
      setDateInput(formatted);
      setForm((f) => ({ ...f, date: digits }));
    }
  };

  const handleCutoffBlur = () => {
    let raw = form.cutoff.trim();
    if (!raw) return;
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 3) {
      setForm(f => ({ ...f, cutoff: "0" + digits }));
    } else if (digits.length === 4) {
      setForm(f => ({ ...f, cutoff: digits }));
    }
  };

  const submitForm = () => {
    let rawCutoff = form.cutoff.trim();
    const digits = rawCutoff.replace(/\D/g, "");
    if (digits.length === 3) {
      rawCutoff = "0" + digits;
    } else if (digits.length === 4) {
      rawCutoff = digits;
    }
    const finalForm = { ...form, cutoff: rawCutoff };

    if (!finalForm.date || finalForm.date.length !== 8) {
      alert("⚠️ Please enter a valid Date in DDMMYYYY format.");
      return;
    }
    if (!finalForm.awb.trim()) {
      alert("⚠️ AWB number is required.");
      return;
    }
    if (!finalForm.flight.trim()) {
      alert("⚠️ Flight number is required.");
      return;
    }
    if (dayMismatch) {
      setShowMismatchConfirm(true);
      return;
    }
    onSave(finalForm);
  };

  return (
    <div
      style={{
        background: T.surface,
        border: "1px solid #e5e7eb",
        borderRadius: 20, // Deliciously bubbly corners
        padding: 32,
        boxShadow: "0 10px 30px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.01)",
      }}
    >
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: T.text,
          marginBottom: 20,
          borderBottom: "1px solid #f3f4f6",
          paddingBottom: 14,
        }}
      >
        {initial?.id ? `✏️ Edit: ${form.shipper || "Shipper"} / AWB: ${form.awb || "—"}` : "➕ New Shipment"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <Field label="Date (dd/mm/yyyy)">
          <div style={{ position: "relative", display: "flex", alignItems: "center", width: "100%" }}>
            <input
              style={{ ...INP, width: "100%", paddingRight: "36px" }}
              placeholder="DD/MM/YYYY"
              value={dateInput}
              onChange={handleDateChange}
              onBlur={handleDateBlur}
              maxLength={10}
            />
            <div style={{ position: "absolute", right: "6px", width: "26px", height: "26px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <button
                type="button"
                id="visual-date-button"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  background: "transparent",
                  border: "none",
                  height: "100%",
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#475569",
                  cursor: "pointer",
                  padding: 0,
                  outline: "none",
                  pointerEvents: "none",
                  zIndex: 1,
                  fontSize: "14px",
                }}
                title="Select shipment date"
              >
                📅
              </button>
              <input
                type="date"
                ref={dateInputRef}
                id="native-date-picker"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  opacity: 0,
                  width: "100%",
                  height: "100%",
                  cursor: "pointer",
                  zIndex: 2,
                }}
                onChange={(e) => {
                  const val = e.target.value; // YYYY-MM-DD
                  if (val) {
                    const parts = val.split("-");
                    if (parts.length === 3) {
                      const yr = parts[0];
                      const mo = parts[1];
                      const dy = parts[2];
                      setForm((f) => ({ ...f, date: `${dy}${mo}${yr}` }));
                      setDateInput(`${dy}/${mo}/${yr}`);
                    }
                  }
                }}
                value={(() => {
                  if (form.date && form.date.length === 8) {
                    const d = form.date.slice(0, 2);
                    const m = form.date.slice(2, 4);
                    const y = form.date.slice(4);
                    return `${y}-${m}-${d}`;
                  }
                  return "";
                })()}
              />
            </div>
          </div>
        </Field>
        <Field label="Flight Number">
          <input
            style={{ ...INP, textTransform: "uppercase", fontWeight: 600 }}
            value={form.flight}
            onChange={handleFlight}
            list="fl-list"
          />
          <datalist id="fl-list">
            {Object.keys(schedule)
              .sort()
              .map((f) => (
                <option key={f} value={f} />
              ))}
          </datalist>
          {hint && (
            <div
              style={{
                fontSize: 10,
                color: hint.startsWith("✓") ? T.green : T.amber,
                marginTop: 2,
                fontWeight: 500,
              }}
            >
              {hint}
            </div>
          )}
        </Field>
        <Field label="Cutoff Time">
          <input style={INP} value={form.cutoff} onChange={set("cutoff")} onBlur={handleCutoffBlur} />
        </Field>
        <Field label="Load Type">
          <select style={SEL} value={form.loadType} onChange={handleLoadType}>
            <option value="UNIT">UNIT</option>
            <option value="LOOSE">LOOSE</option>
          </select>
        </Field>
        <Field label="Shipper / CNEE">
          <input style={INP} value={form.shipper} onChange={set("shipper")} />
        </Field>
        <Field label="AWB #">
          <input style={INP} value={form.awb} onChange={set("awb")} />
        </Field>
        <Field label="Destination">
          <input style={INP} value={form.dest} onChange={set("dest")} />
        </Field>
        <Field label="CTO">
          <select style={SEL} value={isOther ? "OTHER" : form.cto} onChange={handleCtoSelectChange}>
            <option value="">— select —</option>
            {availableCtos.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value="OTHER">OTHER</option>
          </select>
          {isOther && (
            <input
              style={{ ...INP, marginTop: 8, textTransform: "uppercase" }}
              value={form.cto || ""}
              onChange={(e) => {
                const val = e.target.value.toUpperCase();
                setForm((f) => ({ ...f, cto: val }));
              }}
            />
          )}
          {form.cto && !isOther && <div style={{ fontSize: 10, color: T.green, marginTop: 1 }}>✓ {form.cto}</div>}
        </Field>
        <Field label="ULD">
          <input style={INP} value={form.uld} onChange={set("uld")} />
        </Field>
        <Field label="ICE / Temp">
          <input style={INP} value={form.ice} onChange={set("ice")} />
        </Field>
        <Field label="Commodity">
          <input style={INP} value={form.commodity} onChange={set("commodity")} />
        </Field>
        <Field label="Operator Name">
          <input style={INP} value={form.operator} onChange={set("operator")} />
        </Field>
        <Field label="SCR">
          <select style={SEL} value={form.scr} onChange={set("scr")}>
            <option value="YES">YES</option>
            <option value="NO">NO</option>
            <option value="">BLANK</option>
          </select>
        </Field>
        <Field label="Consol Number (Optional)">
          <input style={INP} value={form.consolRef || ""} onChange={set("consolRef")} placeholder="e.g. C0000XXXX" />
        </Field>
        <Field label="Job Number (Optional)">
          <input style={INP} value={form.jobRef || ""} onChange={set("jobRef")} placeholder="e.g. S0000XXXX" />
        </Field>

      </div>
      {dayMismatch && (
        <div
          style={{
            background: "#fffbeb",
            border: "1px dashed #f59e0b",
            borderRadius: "12px",
            padding: "12px 16px",
            marginTop: "16px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            fontSize: "13px",
            color: "#b45309",
            fontWeight: 500,
          }}
        >
          <span style={{ fontSize: "16px" }}>⚠️</span>
          <div>
            <strong>Warning:</strong> No flight scheduled for{" "}
            <strong>{dayMismatch.dayName}</strong> ({toDisplay(form.date)}) on{" "}
            <strong>{dayMismatch.flightCode}</strong>.
            <br />
            <span style={{ opacity: 0.9, fontSize: "11px" }}>
              Weekly schedule for {dayMismatch.flightCode} is set to:{" "}
              <span style={{ fontFamily: "monospace", fontWeight: 700, letterSpacing: "1px" }}>
                {dayMismatch.daysConfig}
              </span>
            </span>
          </div>
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        <Field label="Special Instructions">
          <textarea
            style={{ ...INP, resize: "vertical", minHeight: 64 }}
            value={form.specialInst}
            onChange={set("specialInst")}
          />
        </Field>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 20, justifyContent: "flex-end" }}>
        <button
          onClick={onCancel}
          style={{
            background: "#f5f5f7",
            border: "1px solid #e5e7eb",
            color: T.textMid,
            borderRadius: 20, // Capsule pill button
            padding: "10px 24px",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          Cancel
        </button>
        <button
          onClick={submitForm}
          style={{
            background: T.accent,
            border: "none",
            color: "#fff",
            borderRadius: 20, // Capsule pill button
            padding: "10px 26px",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {initial?.id ? "Save Changes" : "Add Shipment"}
        </button>
      </div>

      {showMismatchConfirm && dayMismatch && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "20px",
              width: "100%",
              maxWidth: "520px",
              padding: "30px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              border: "1px solid #e2e8f0",
            }}
          >
            <div style={{ display: "flex", gap: "16px", alignItems: "flex-start", marginBottom: "20px" }}>
              <div
                style={{
                  background: "#fef3c7",
                  color: "#d97706",
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "24px",
                  flexShrink: 0,
                }}
              >
                ⚠️
              </div>
              <div>
                <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#1e293b", margin: "0 0 6px 0" }}>
                  Flight Schedule Conflict
                </h3>
                <p style={{ fontSize: "14px", color: "#475569", margin: 0, lineHeight: "1.5" }}>
                  The selected date <strong>{toDisplay(form.date)}</strong> falls on a{" "}
                  <strong>{dayMismatch.dayName}</strong>, but there is no flight allocated on this day for{" "}
                  <strong>{dayMismatch.flightCode}</strong> in your schedule.
                </p>
              </div>
            </div>

            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "14px 18px",
                marginBottom: "24px",
              }}
            >
              <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>
                Current Weekly Schedule
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>
                  {dayMismatch.flightCode}
                </span>
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: "14px",
                    fontWeight: 800,
                    letterSpacing: "2px",
                    background: "#e2e8f0",
                    color: "#334155",
                    padding: "3px 10px",
                    borderRadius: "6px",
                  }}
                >
                  {dayMismatch.daysConfig}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                onClick={() => {
                  setShowMismatchConfirm(false);
                  onSave(form);
                }}
                style={{
                  width: "100%",
                  background: T.accent,
                  color: "#ffffff",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: "none",
                  fontSize: "13px",
                  fontWeight: 650,
                  cursor: "pointer",
                }}
              >
                Proceed & Save Anyway
              </button>

              {onGoToFlights && (
                <button
                  onClick={() => {
                    setShowMismatchConfirm(false);
                    onGoToFlights();
                  }}
                  style={{
                    width: "100%",
                    background: "#f0fdf4",
                    border: "1px solid #bcf0da",
                    color: "#166534",
                    padding: "12px 16px",
                    borderRadius: "12px",
                    fontSize: "13px",
                    fontWeight: 650,
                    cursor: "pointer",
                  }}
                >
                  Update Flight Schedule
                </button>
              )}

              <button
                onClick={() => setShowMismatchConfirm(false)}
                style={{
                  width: "100%",
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  color: "#475569",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Cancel & Edit Date/Flight
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
