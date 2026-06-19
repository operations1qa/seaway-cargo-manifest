/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Shipment, FlightSchedule } from "../types";
import { T, INP, SEL } from "../utils/theme";
import { toDisplay, todayStr, subtractHour, getAvailableCtos, formatAwb } from "../utils/helpers";
import { Field } from "./UIAtoms";

interface EntryFormProps {
  initial: Shipment | null;
  onSave: (form: Shipment) => void;
  onCancel: () => void;
  schedule: FlightSchedule;
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

export const EntryForm: React.FC<EntryFormProps> = ({
  initial,
  onSave,
  onCancel,
  schedule,
}) => {
  const DEFAULT_CTOS = ["MENZIES", "SWISSPORT", "QANTAS", "TOLL"];
  
  const [form, setForm] = useState<Shipment>(() => {
    if (initial) {
      return { ...initial };
    }
    return { ...BLANK, date: todayStr(), id: 0 } as Shipment;
  });

  const [isOther, setIsOther] = useState(() => {
    if (initial && initial.cto) {
      const val = initial.cto.trim().toUpperCase();
      return val && !DEFAULT_CTOS.includes(val);
    }
    return false;
  });

  const [hint, setHint] = useState("");

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
      const co = form.loadType === "LOOSE" ? subtractHour(sched.cutoff) : sched.cutoff;
      const schedCto = sched.cto || "";
      const isCustomCto = schedCto && !DEFAULT_CTOS.includes(schedCto.trim().toUpperCase());
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
        `✓ Cutoff: ${co || "—"} · CTO: ${sched.cto} · Dest: ${sched.dest || "—"}${form.loadType === "LOOSE" ? " (−1hr LOOSE)" : ""}`
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
      const co = lt === "LOOSE" ? subtractHour(sched.cutoff) : sched.cutoff;
      setForm((f) => ({
        ...f,
        loadType: lt,
        cutoff: co,
      }));
      setHint(`✓ Cutoff: ${co} ${lt === "LOOSE" ? "(−1hr)" : ""}`);
    } else {
      setForm((f) => ({ ...f, loadType: lt }));
    }
  };

  const handleDate = (e: React.ChangeEvent<HTMLInputElement>) => {
    const d = e.target.value.replace(/\D/g, "").slice(0, 8);
    setForm((f) => ({ ...f, date: d }));
  };

  const submitForm = () => {
    if (!form.date || form.date.length !== 8) {
      alert("⚠️ Please enter a valid Date in DDMMYYYY format.");
      return;
    }
    if (!form.awb.trim()) {
      alert("⚠️ AWB number is required.");
      return;
    }
    if (!form.flight.trim()) {
      alert("⚠️ Flight number is required.");
      return;
    }
    onSave(form);
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
          <input
            style={INP}
            value={toDisplay(form.date)}
            onChange={handleDate}
            maxLength={10}
          />
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
          <input style={INP} value={form.cutoff} onChange={set("cutoff")} />
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
            {getAvailableCtos().map((c) => (
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
        <Field label="Unit Numbers">
          <input style={INP} value={form.unitNum} onChange={set("unitNum")} />
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
        <Field label="Job Ref">
          <input style={INP} value={form.jobRef || ""} onChange={set("jobRef")} />
        </Field>
        <Field label="Consol Ref">
          <input style={INP} value={form.consolRef || ""} onChange={set("consolRef")} />
        </Field>
      </div>
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
    </div>
  );
};
