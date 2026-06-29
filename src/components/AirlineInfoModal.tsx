/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Mail, Phone, Info, X, Clock, MapPin, Users, Calendar, Copy, Check, PlaneTakeoff, HelpCircle, Globe } from "lucide-react";
import { FlightSchedule } from "../types";
import { getAirlineForFlight } from "../utils/helpers";
import { T } from "../utils/theme";

interface AirlineInfoModalProps {
  isOpen: boolean;
  flightCode: string | null;
  schedule: FlightSchedule;
  onClose: () => void;
  onGoToFlightSchedule?: (flightCode: string) => void;
}

export function AirlineInfoModal({ isOpen, flightCode, schedule, onClose, onGoToFlightSchedule }: AirlineInfoModalProps) {
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedPortal, setCopiedPortal] = useState(false);
  const [copiedNotes, setCopiedNotes] = useState(false);

  if (!isOpen || !flightCode) return null;

  const normalizedFlight = flightCode.toUpperCase().trim();
  const info = schedule[normalizedFlight];

  const airlineName = info?.airline || getAirlineForFlight(normalizedFlight);
  const hasInfo = !!info;

  const handleCopyText = async (text: string, type: "email" | "phone" | "portal" | "notes") => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for sandboxed iframe environments or non-HTTPS connections
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      if (type === "email") {
        setCopiedEmail(true);
        setTimeout(() => setCopiedEmail(false), 2000);
      } else if (type === "phone") {
        setCopiedPhone(true);
        setTimeout(() => setCopiedPhone(false), 2000);
      } else if (type === "portal") {
        setCopiedPortal(true);
        setTimeout(() => setCopiedPortal(false), 2000);
      } else {
        setCopiedNotes(true);
        setTimeout(() => setCopiedNotes(false), 2000);
      }
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
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
      id="airline-info-modal-overlay"
      onClick={(e) => {
        if ((e.target as HTMLElement).id === "airline-info-modal-overlay") {
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
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          overflow: "hidden",
          animation: "fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          border: `1px solid ${T.border}`,
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            background: "#0c4a6e", // Corporate deep blue matching cargo design
            color: "#ffffff",
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "18px" }}>✈️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Airline Information
              </h3>
              <p style={{ margin: 0, fontSize: "11px", opacity: 0.85, fontWeight: 500 }}>
                Operations & Cargo booking parameters for {normalizedFlight}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.15)",
              border: "none",
              color: "#ffffff",
              width: "28px",
              height: "28px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              cursor: "pointer",
              transition: "background 0.2s ease",
              outline: "none",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.25)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.15)")}
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "24px", maxHeight: "80vh", overflowY: "auto" }}>
          {!hasInfo ? (
            /* Fallback State */
            <div style={{ textAlign: "center", padding: "12px 6px" }}>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "24px",
                  background: "#f0fdf4",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px auto",
                }}
              >
                <HelpCircle size={24} style={{ color: "#16a34a" }} />
              </div>
              <h4 style={{ fontSize: "15px", fontWeight: 700, color: "#1e293b", margin: "0 0 8px 0" }}>
                No custom schedule info found
              </h4>
              <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 20px 0", lineHeight: "1.5" }}>
                There is currently no saved operational profile for flight <strong style={{ color: "#334155" }}>{normalizedFlight}</strong> ( {airlineName} ) in this workstation database.
              </p>

              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "12px",
                  padding: "12px",
                  marginBottom: "20px",
                  textAlign: "left",
                }}
              >
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#475569", textTransform: "uppercase" }}>Estimated Defaults</span>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", fontSize: "13px" }}>
                  <span style={{ color: "#64748b" }}>Airline Operator</span>
                  <span style={{ fontWeight: 600, color: "#0f172a" }}>{airlineName}</span>
                </div>
              </div>

              {onGoToFlightSchedule && (
                <button
                  onClick={() => {
                    onGoToFlightSchedule(normalizedFlight);
                    onClose();
                  }}
                  style={{
                    background: "#0284c7",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 18px",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: "0 2px 4px rgba(2, 132, 199, 0.2)",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#0369a1";
                    e.currentTarget.style.boxShadow = "0 4px 6px rgba(2, 132, 199, 0.3)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#0284c7";
                    e.currentTarget.style.boxShadow = "0 2px 4px rgba(2, 132, 199, 0.2)";
                  }}
                >
                  Configure {normalizedFlight} Schedule Now
                </button>
              )}
            </div>
          ) : (
            /* Info Exists */
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              
              {/* Profile Card */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
                  border: "1px solid #bbf7d0",
                  borderRadius: "12px",
                  padding: "16px",
                }}
              >
                <div>
                  <div style={{ fontSize: "10px", fontWeight: 800, color: "#166534", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Active Flight Profile
                  </div>
                  <h4 style={{ fontSize: "20px", fontWeight: 850, color: "#14532d", margin: "4px 0 2px 0", fontFamily: "monospace" }}>
                    {normalizedFlight}
                  </h4>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#15803d" }}>
                    {airlineName}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <span
                    style={{
                      background: "#16a34a",
                      color: "#ffffff",
                      borderRadius: "6px",
                      padding: "4px 8px",
                      fontSize: "11px",
                      fontWeight: 700,
                    }}
                  >
                    CTO: {info.cto || "QANTAS"}
                  </span>
                </div>
              </div>

              {/* Dynamic Grid Details */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                
                {/* Routing & Days */}
                <div style={{ background: "#f8fafc", border: `1px solid ${T.border}`, borderRadius: "12px", padding: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#475569", fontSize: "11px", fontWeight: 700, marginBottom: "8px", textTransform: "uppercase" }}>
                    <MapPin size={13} style={{ color: T.accent }} /> Route & Rotation
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                      <span style={{ color: "#64748b" }}>Origin & Dest</span>
                      <strong style={{ color: "#0f172a" }}>{info.origin || "MEL"} ➔ {info.dest || "—"}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                      <span style={{ color: "#64748b" }}>Operating Days</span>
                      <strong style={{ color: "#0f172a", fontFamily: "monospace" }}>{info.days || "MTWTFSS"}</strong>
                    </div>
                  </div>
                </div>

                {/* Timing info */}
                <div style={{ background: "#f8fafc", border: `1px solid ${T.border}`, borderRadius: "12px", padding: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#475569", fontSize: "11px", fontWeight: 700, marginBottom: "8px", textTransform: "uppercase" }}>
                    <Clock size={13} style={{ color: T.accent }} /> Target Cutoffs
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                      <span style={{ color: "#451a03", fontWeight: 600 }}>CARGO CUTOFF</span>
                      <strong style={{ color: "#92400e", fontWeight: 800 }}>{(info.cutoff || "—").replace(/(..)(..)/, "$1:$2")}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                      <span style={{ color: "#64748b" }}>ETD / ETA</span>
                      <strong style={{ color: "#0f172a" }}>
                        {(info.etd || "—").replace(/(..)(..)/, "$1:$2")} / {(info.eta || "—").replace(/(..)(..)/, "$1:$2")}
                      </strong>
                    </div>
                  </div>
                </div>

              </div>

              {/* Contacts Block */}
              <div
                style={{
                  border: `1px solid ${T.border}`,
                  borderRadius: "12px",
                  padding: "16px",
                  background: "#ffffff",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                {/* Title */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px", color: T.text, fontSize: "12px", fontWeight: 750, borderBottom: `1px solid ${T.border2}`, paddingBottom: "8px" }}>
                  <Users size={14} style={{ color: T.accent }} /> Operations Contact Channels
                </div>

                {/* Email Contacts */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <span style={{ fontWeight: 650, color: "#475569", fontSize: "11px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Mail size={12} style={{ color: "#64748b" }} /> Email Group
                    </span>
                    {info.emailContacts && (
                      <button
                        onClick={() => handleCopyText(info.emailContacts || "", "email")}
                        style={{ border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "3px", fontSize: "11px", color: T.accent, fontWeight: 600 }}
                      >
                        {copiedEmail ? <Check size={11} style={{ color: T.green }} /> : <Copy size={11} />}
                        <span>{copiedEmail ? "Copied" : "Copy"}</span>
                      </button>
                    )}
                  </div>
                  <div style={{ background: "#ffffff", border: `1px solid ${T.border}`, padding: "8px 12px", borderRadius: "8px", fontSize: "13px", fontWeight: info.emailContacts ? 600 : 400, color: info.emailContacts ? "#0f172a" : "#94a3b8" }}>
                    {info.emailContacts ? (
                      <a href={`mailto:${info.emailContacts}`} style={{ color: T.accent, textDecoration: "none" }}>
                        {info.emailContacts}
                      </a>
                    ) : (
                      "(No custom email contacts set for this flight)"
                    )}
                  </div>
                </div>

                {/* Contact Phone */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <span style={{ fontWeight: 650, color: "#475569", fontSize: "11px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Phone size={12} style={{ color: "#64748b" }} /> Phone Dispatch
                    </span>
                    {info.contactPhone && (
                      <button
                        onClick={() => handleCopyText(info.contactPhone || "", "phone")}
                        style={{ border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "3px", fontSize: "11px", color: T.accent, fontWeight: 600 }}
                      >
                        {copiedPhone ? <Check size={11} style={{ color: T.green }} /> : <Copy size={11} />}
                        <span>{copiedPhone ? "Copied" : "Copy"}</span>
                      </button>
                    )}
                  </div>
                  <div style={{ background: "#ffffff", border: `1px solid ${T.border}`, padding: "8px 12px", borderRadius: "8px", fontSize: "13px", fontWeight: info.contactPhone ? 600 : 400, color: info.contactPhone ? "#0f172a" : "#94a3b8" }}>
                    {info.contactPhone ? (
                      <a href={`tel:${info.contactPhone}`} style={{ color: T.accent, textDecoration: "none" }}>
                        {info.contactPhone}
                      </a>
                    ) : (
                      "(No phone contact set for this flight)"
                    )}
                  </div>
                </div>

                {/* Booking Portal website */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <span style={{ fontWeight: 650, color: "#475569", fontSize: "11px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Globe size={12} style={{ color: "#64748b" }} /> Booking Portal website
                    </span>
                    {info.bookingPortal && (
                      <button
                        onClick={() => handleCopyText(info.bookingPortal || "", "portal")}
                        style={{ border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "3px", fontSize: "11px", color: T.accent, fontWeight: 600 }}
                      >
                        {copiedPortal ? <Check size={11} style={{ color: T.green }} /> : <Copy size={11} />}
                        <span>{copiedPortal ? "Copied" : "Copy"}</span>
                      </button>
                    )}
                  </div>
                  <div style={{ background: "#ffffff", border: `1px solid ${T.border}`, padding: "8px 12px", borderRadius: "8px", fontSize: "13px", fontWeight: info.bookingPortal ? 600 : 400, color: info.bookingPortal ? "#0f172a" : "#94a3b8" }}>
                    {info.bookingPortal ? (
                      <a href={info.bookingPortal.startsWith("http") ? info.bookingPortal : `https://${info.bookingPortal}`} target="_blank" rel="noopener noreferrer" style={{ color: T.accent, textDecoration: "none" }}>
                        {info.bookingPortal}
                      </a>
                    ) : (
                      "(No booking portal website set for this flight)"
                    )}
                  </div>
                </div>
              </div>

              {/* Booking Notes/Special Instructions */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px", color: T.text, fontSize: "12px", fontWeight: 750 }}>
                    <Info size={14} style={{ color: "#d97706" }} /> Booking Notes & SLA Instructions
                  </span>
                  {info.bookingNotes && (
                    <button
                      onClick={() => handleCopyText(info.bookingNotes || "", "notes")}
                      style={{ border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "3px", fontSize: "11px", color: T.accent, fontWeight: 600 }}
                    >
                      {copiedNotes ? <Check size={11} style={{ color: T.green }} /> : <Copy size={11} />}
                      <span>{copiedNotes ? "Copied" : "Copy"}</span>
                    </button>
                  )}
                </div>
                <div
                  style={{
                    background: "#ffffff",
                    border: `1px solid ${T.border}`,
                    color: info.bookingNotes ? "#1e293b" : "#94a3b8",
                    padding: "12px 14px",
                    borderRadius: "12px",
                    fontSize: "12.5px",
                    lineHeight: "1.6",
                    whiteSpace: "pre-wrap",
                    minHeight: "70px",
                  }}
                >
                  {info.bookingNotes || "No operational booking SLA instructions or specialized delivery directives are currently logged for this flight."}
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            background: "#f8fafc",
            borderTop: `1px solid ${T.border}`,
            padding: "14px 20px",
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: "#ffffff",
              border: `1px solid ${T.border}`,
              color: T.text,
              borderRadius: "8px",
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#ffffff")}
          >
            Close Dialog
          </button>
        </div>
      </div>
    </div>
  );
}
