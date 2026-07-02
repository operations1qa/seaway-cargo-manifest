/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Mail, Phone, Info, X, Clock, MapPin, Users, Calendar, Copy, Check, PlaneTakeoff, HelpCircle, Globe } from "lucide-react";
import { FlightSchedule, CtoDirectory } from "../types";
import { getAirlineForFlight } from "../utils/helpers";
import { T } from "../utils/theme";

interface AirlineInfoModalProps {
  isOpen: boolean;
  flightCode: string | null;
  schedule: FlightSchedule;
  onClose: () => void;
  onGoToFlightSchedule?: (flightCode: string) => void;
  ctoDirectory?: CtoDirectory;
}

export function AirlineInfoModal({ isOpen, flightCode, schedule, onClose, onGoToFlightSchedule, ctoDirectory }: AirlineInfoModalProps) {
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedPortal, setCopiedPortal] = useState(false);
  const [copiedNotes, setCopiedNotes] = useState(false);

  if (!isOpen || !flightCode) return null;

  const normalizedFlight = flightCode.toUpperCase().trim();
  const info = schedule[normalizedFlight];

  const airlineName = info?.airline || getAirlineForFlight(normalizedFlight);
  const hasInfo = !!info;

  const assignedCtoName = (info?.cto || "QANTAS").toUpperCase().trim();
  const ctoDetailsForProfile = ctoDirectory ? ctoDirectory[assignedCtoName] : undefined;
  const ctoColor = ctoDetailsForProfile?.color || "#16a34a";

  const getSoftColor = (hex: string, alpha: string = "12") => {
    if (!hex) return "";
    const cleanHex = hex.replace("#", "");
    return `#${cleanHex}${alpha}`;
  };

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
          maxWidth: "600px",
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
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              
              {/* Top Row: Profile & Route Information side-by-side */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                
                {/* Flight Profile Card */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    background: `linear-gradient(135deg, ${getSoftColor(ctoColor, "08")} 0%, ${getSoftColor(ctoColor, "18")} 100%)`,
                    border: `1px solid ${getSoftColor(ctoColor, "35")}`,
                    borderRadius: "12px",
                    padding: "12px",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "10px", fontWeight: 800, color: ctoColor, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
                      Active Flight Profile
                    </div>
                    <h4 style={{ fontSize: "18px", fontWeight: 850, color: "#0f172a", margin: "0 0 2px 0", fontFamily: "monospace", lineHeight: "1.1" }}>
                      {normalizedFlight}
                    </h4>
                    <div style={{ fontSize: "12.5px", fontWeight: 600, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {airlineName}
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-start", marginTop: "8px" }}>
                    <span
                      style={{
                        background: ctoColor,
                        color: "#ffffff",
                        borderRadius: "6px",
                        padding: "3px 8px",
                        fontSize: "11px",
                        fontWeight: 700,
                      }}
                    >
                      CTO: {info.cto || "QANTAS"}
                    </span>
                  </div>
                </div>

                {/* Route Information Card */}
                <div style={{ background: "#f8fafc", border: `1px solid ${T.border}`, borderRadius: "12px", padding: "12px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#475569", fontSize: "11px", fontWeight: 700, marginBottom: "8px", textTransform: "uppercase" }}>
                      <MapPin size={13} style={{ color: T.accent }} /> Route Information
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
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
                </div>

              </div>

              {/* Timing Row: Cargo Cutoff and ETD/ETA (No Target Cutoffs title) */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                {/* Cargo Cutoff */}
                <div style={{ background: "#fffbeb", border: "1px solid #fef3c7", borderRadius: "10px", padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#451a03", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" }}>Cargo Cutoff</span>
                  <strong style={{ color: "#b45309", fontSize: "13px", fontWeight: 800, fontFamily: "monospace" }}>
                    {(info.cutoff || "—").replace(/(..)(..)/, "$1:$2")}
                  </strong>
                </div>
                {/* ETD / ETA */}
                <div style={{ background: "#f8fafc", border: `1px solid ${T.border}`, borderRadius: "10px", padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#475569", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" }}>ETD / ETA</span>
                  <strong style={{ color: "#0f172a", fontSize: "13px", fontFamily: "monospace" }}>
                    {(info.etd || "—").replace(/(..)(..)/, "$1:$2")} / {(info.eta || "—").replace(/(..)(..)/, "$1:$2")}
                  </strong>
                </div>
              </div>

              {/* Operations Contact Channels (Spacious Stacked Layout) */}
              <div
                style={{
                  border: `1px solid ${T.border}`,
                  borderRadius: "12px",
                  padding: "12px 14px",
                  background: "#ffffff",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", color: T.text, fontSize: "12px", fontWeight: 750, borderBottom: `1px solid ${T.border2}`, paddingBottom: "6px" }}>
                  <Users size={14} style={{ color: T.accent }} /> Airline Contacts
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {/* GSA/AIRLINE Section */}
                  <div 
                    style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "space-between", 
                      background: "#f0f9ff", 
                      border: "1px solid #bae6fd", 
                      borderRadius: "8px", 
                      padding: "10px 12px",
                      gap: "12px",
                      flexWrap: "wrap"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "200px" }}>
                      <div style={{ 
                        background: "#e0f2fe", 
                        color: "#0369a1", 
                        padding: "6px", 
                        borderRadius: "6px", 
                        display: "flex", 
                        alignItems: "center", 
                        justifyContent: "center" 
                      }}>
                        <Users size={14} />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontSize: "10px", fontWeight: 700, color: "#0369a1", textTransform: "uppercase", letterSpacing: "0.5px" }}>GSA / AIRLINE</span>
                        <span style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>{info.gsa || "— Not Specified —"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Email Column */}
                  <div 
                    style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "space-between", 
                      background: "#f8fafc", 
                      border: `1px solid ${T.border}`, 
                      borderRadius: "8px", 
                      padding: "10px 12px",
                      gap: "12px",
                      flexWrap: "wrap"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "200px" }}>
                      <div style={{ 
                        background: "#e0f2fe", 
                        color: "#0369a1", 
                        padding: "6px", 
                        borderRadius: "6px", 
                        display: "flex", 
                        alignItems: "center", 
                        justifyContent: "center" 
                      }}>
                        <Mail size={14} />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Email Address</span>
                        {info.emailContacts ? (
                          <a 
                            href={`mailto:${info.emailContacts}`} 
                            style={{ 
                              color: T.accent, 
                              textDecoration: "none", 
                              fontSize: "13px", 
                              fontWeight: 600,
                              wordBreak: "break-all"
                            }}
                          >
                            {info.emailContacts}
                          </a>
                        ) : (
                          <span style={{ fontSize: "13px", color: "#94a3b8" }}>— Not Specified —</span>
                        )}
                      </div>
                    </div>
                    {info.emailContacts && (
                      <button
                        onClick={() => handleCopyText(info.emailContacts || "", "email")}
                        style={{ 
                          border: `1px solid ${T.border}`, 
                          background: "#ffffff", 
                          cursor: "pointer", 
                          display: "flex", 
                          alignItems: "center", 
                          gap: "4px", 
                          fontSize: "11px", 
                          color: "#475569", 
                          fontWeight: 700,
                          padding: "6px 12px",
                          borderRadius: "6px",
                          transition: "all 0.15s ease",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "#f1f5f9"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "#ffffff"; }}
                      >
                        {copiedEmail ? <Check size={12} style={{ color: T.green }} /> : <Copy size={12} />}
                        <span>{copiedEmail ? "Copied" : "Copy"}</span>
                      </button>
                    )}
                  </div>

                  {/* Phone Column */}
                  <div 
                    style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "space-between", 
                      background: "#f8fafc", 
                      border: `1px solid ${T.border}`, 
                      borderRadius: "8px", 
                      padding: "10px 12px",
                      gap: "12px",
                      flexWrap: "wrap"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "200px" }}>
                      <div style={{ 
                        background: "#f0fdf4", 
                        color: "#16a34a", 
                        padding: "6px", 
                        borderRadius: "6px", 
                        display: "flex", 
                        alignItems: "center", 
                        justifyContent: "center" 
                      }}>
                        <Phone size={14} />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Phone Number</span>
                        {info.contactPhone ? (
                          <a 
                            href={`tel:${info.contactPhone}`} 
                            style={{ 
                              color: T.accent, 
                              textDecoration: "none", 
                              fontSize: "13px", 
                              fontWeight: 600,
                              wordBreak: "break-all"
                            }}
                          >
                            {info.contactPhone}
                          </a>
                        ) : (
                          <span style={{ fontSize: "13px", color: "#94a3b8" }}>— Not Specified —</span>
                        )}
                      </div>
                    </div>
                    {info.contactPhone && (
                      <button
                        onClick={() => handleCopyText(info.contactPhone || "", "phone")}
                        style={{ 
                          border: `1px solid ${T.border}`, 
                          background: "#ffffff", 
                          cursor: "pointer", 
                          display: "flex", 
                          alignItems: "center", 
                          gap: "4px", 
                          fontSize: "11px", 
                          color: "#475569", 
                          fontWeight: 700,
                          padding: "6px 12px",
                          borderRadius: "6px",
                          transition: "all 0.15s ease",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "#f1f5f9"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "#ffffff"; }}
                      >
                        {copiedPhone ? <Check size={12} style={{ color: T.green }} /> : <Copy size={12} />}
                        <span>{copiedPhone ? "Copied" : "Copy"}</span>
                      </button>
                    )}
                  </div>

                  {/* Booking Portal website */}
                  <div 
                    style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "space-between", 
                      background: "#f8fafc", 
                      border: `1px solid ${T.border}`, 
                      borderRadius: "8px", 
                      padding: "10px 12px",
                      gap: "12px",
                      flexWrap: "wrap"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "200px" }}>
                      <div style={{ 
                        background: "#faf5ff", 
                        color: "#8b5cf6", 
                        padding: "6px", 
                        borderRadius: "6px", 
                        display: "flex", 
                        alignItems: "center", 
                        justifyContent: "center" 
                      }}>
                        <Globe size={14} />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Booking Portal</span>
                        {info.bookingPortal ? (
                          <a 
                            href={info.bookingPortal.startsWith("http") ? info.bookingPortal : `https://${info.bookingPortal}`} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            style={{ 
                              color: T.accent, 
                              textDecoration: "none", 
                              fontSize: "13px", 
                              fontWeight: 600,
                              wordBreak: "break-all"
                            }}
                          >
                            {info.bookingPortal}
                          </a>
                        ) : (
                          <span style={{ fontSize: "13px", color: "#94a3b8" }}>— Not Specified —</span>
                        )}
                      </div>
                    </div>
                    {info.bookingPortal && (
                      <button
                        onClick={() => handleCopyText(info.bookingPortal || "", "portal")}
                        style={{ 
                          border: `1px solid ${T.border}`, 
                          background: "#ffffff", 
                          cursor: "pointer", 
                          display: "flex", 
                          alignItems: "center", 
                          gap: "4px", 
                          fontSize: "11px", 
                          color: "#475569", 
                          fontWeight: 700,
                          padding: "6px 12px",
                          borderRadius: "6px",
                          transition: "all 0.15s ease",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "#f1f5f9"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "#ffffff"; }}
                      >
                        {copiedPortal ? <Check size={12} style={{ color: T.green }} /> : <Copy size={12} />}
                        <span>{copiedPortal ? "Copied" : "Copy"}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Booking Notes/Special Instructions */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
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
                    padding: "8px 12px",
                    borderRadius: "10px",
                    fontSize: "12px",
                    lineHeight: "1.4",
                    whiteSpace: "pre-wrap",
                    minHeight: "40px",
                  }}
                >
                  {info.bookingNotes || "No booking notes specified for this flight."}
                </div>
              </div>

              {/* Attached CTO Details Section */}
              {(() => {
                const assignedCtoName = (info?.cto || "QANTAS").toUpperCase().trim();
                const ctoDetails = ctoDirectory ? ctoDirectory[assignedCtoName] : undefined;
                if (!ctoDetails) return null;
                
                return (
                  <div style={{
                    border: `1.5px dashed #0284c7`,
                    borderRadius: "12px",
                    padding: "10px 12px",
                    background: "#f0f9ff",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    marginTop: "2px"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#0369a1", fontSize: "12px", fontWeight: 800, borderBottom: `1px solid #bae6fd`, paddingBottom: "4px" }}>
                      🏢 {assignedCtoName} CTO Details
                    </div>
                    
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", fontSize: "12px", color: "#334155" }}>
                      {ctoDetails.address && (
                        <div style={{ gridColumn: "span 2" }}>
                          <strong style={{ color: "#0369a1" }}>📍 Address: </strong> {ctoDetails.address}
                        </div>
                      )}
                      {ctoDetails.hours && (
                        <div style={{ gridColumn: "span 2" }}>
                          <strong style={{ color: "#0369a1" }}>🕒 Hours: </strong> {ctoDetails.hours}
                        </div>
                      )}
                      {ctoDetails.phone && (
                        <div>
                          <strong style={{ color: "#0369a1" }}>📞 Phone: </strong>
                          <a href={`tel:${ctoDetails.phone}`} style={{ color: "#0284c7", textDecoration: "none", fontWeight: 600 }}>{ctoDetails.phone}</a>
                        </div>
                      )}
                      {ctoDetails.email && (
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <strong style={{ color: "#0369a1" }}>✉️ Email: </strong>
                          <a href={`mailto:${ctoDetails.email}`} style={{ color: "#0284c7", textDecoration: "none", fontWeight: 600 }} title={ctoDetails.email}>{ctoDetails.email}</a>
                        </div>
                      )}
                    </div>

                    {ctoDetails.notes && (
                      <div style={{
                        background: "#ffffff",
                        border: "1px solid #bae6fd",
                        borderRadius: "8px",
                        padding: "6px 10px",
                        fontSize: "11.5px",
                        color: "#1e293b",
                        whiteSpace: "pre-wrap",
                        lineHeight: "1.4",
                        marginTop: "2px"
                      }}>
                        <strong style={{ color: "#0369a1", fontSize: "10.5px", textTransform: "uppercase" }}>CTO Instructions: </strong>
                        {ctoDetails.notes}
                      </div>
                    )}
                  </div>
                );
              })()}

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
