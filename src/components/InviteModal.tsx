/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { Mail, Copy, Check, Info, X, MessageSquare, ExternalLink } from "lucide-react";

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    displayName: string;
    email: string;
    passcode: string;
    station?: string;
  } | null;
  workspaceId?: string;
  workspaceName?: string;
}

export function InviteModal({ isOpen, onClose, user, workspaceId, workspaceName }: InviteModalProps) {
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedChat, setCopiedChat] = useState(false);
  const [activeTab, setActiveTab] = useState<"email" | "chat">("email");

  if (!isOpen || !user) return null;

  const appUrl = "https://seaway-cargo-manifest.vercel.app/";

  const stationInfo = user.station ? `\n- Workstation Address IATA: ${user.station}` : "";
  const stationInfoSlack = user.station ? `\n📍 *Workstation IATA:* \`${user.station}\`` : "";

  // Formatted templates
  const emailSubject = `[ACTION REQUIRED] Onboarding: Corporate Cargo Scheduler Credentials`;
  
  const emailBody = `Dear ${user.displayName},

You have been granted official access to our Cargo Scheduler Ledger. Please follow the instructions below to access the workspace and collaborate on cargo planning/flights:

1. App Workspace Live Link:
${appUrl}

2. Login Credentials:
- Corporate Email Address: ${user.email}
- Secure Password/Passcode: ${user.passcode}${stationInfo}

Instructions:
Click the workspace link above, select the "Work Email / Passcode" or "Direct sign in" option, enter your credentials as listed, and click "Authorize Station Access" to log in. You will instantly synchronize with the live sheet, cargo manifests, load sheets, and flight schedules.

Best regards,
Operations Management Team`;

  const chatBody = `*Cargo Scheduler Access Granted* ✈️
Dear *${user.displayName}*, you are authorized!
🔗 *App Live Link:* ${appUrl}
✉️ *Work Email Address:* \`${user.email}\`
🔑 *Passcode:* \`${user.passcode}\`${stationInfoSlack}
_To join: open the link, click "Work Email / Passcode", and log in with your credentials._`;

  // Standard handler to copy content to clipboard using the modern clipboard API
  const handleCopyText = async (text: string, type: "email" | "chat") => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
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
      } else {
        setCopiedChat(true);
        setTimeout(() => setCopiedChat(false), 2000);
      }
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  // Generate mailto link with safe url encoding
  const mailtoUrl = `mailto:${encodeURIComponent(user.email)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;

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
      id="invite-modal-overlay"
      onClick={(e) => {
        if ((e.target as HTMLElement).id === "invite-modal-overlay") {
          onClose();
        }
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "520px",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          overflow: "hidden",
          animation: "fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            background: "#0c4a6e", // Corporate deep blue
            color: "#ffffff",
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "16px" }}>✈️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Send Onboarding Invite
              </h3>
              <p style={{ margin: 0, fontSize: "11px", opacity: 0.8 }}>
                Share access instructions for {user.displayName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.15)",
              border: "none",
              color: "#ffffff",
              padding: "4px",
              borderRadius: "50%",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "24px",
              height: "24px",
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.3)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.15)"}
          >
            <X size={14} />
          </button>
        </div>

        {/* Modal Content */}
        <div style={{ padding: "20px" }}>
          {/* Quick Info Box */}
          <div
            style={{
              background: "#f0f9ff",
              border: "1px solid #bae6fd",
              borderRadius: "10px",
              padding: "10px 12px",
              display: "flex",
              gap: "10px",
              alignItems: "start",
              fontSize: "12px",
              color: "#0369a1",
              marginBottom: "16px",
            }}
          >
            <Info size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
            <p style={{ margin: 0, lineHeight: 1.4, fontWeight: 500 }}>
              The invite automatically generates credentials and references this exact web address (<strong>{appUrl}</strong>) so colleagues can join your workspace.
            </p>
          </div>



          {/* Credentials Summary */}
          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              padding: "12px",
              fontSize: "12px",
              marginBottom: "16px",
            }}
          >
            <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>
              Teammate Access Profile
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "6px 12px", alignItems: "center" }}>
              <span style={{ color: "#64748b", fontWeight: 500 }}>Name:</span>
              <strong style={{ color: "#0f172a" }}>{user.displayName}</strong>

              <span style={{ color: "#64748b", fontWeight: 500 }}>Work Email:</span>
              <span style={{ color: "#0f172a", fontFamily: "monospace" }}>{user.email}</span>

              <span style={{ color: "#64748b", fontWeight: 500 }}>Secured Passcode:</span>
              <span style={{ color: "#0284c7", fontWeight: 700, fontFamily: "monospace" }}>🔑 {user.passcode}</span>

              {user.station && (
                <>
                  <span style={{ color: "#64748b", fontWeight: 500 }}>IATA:</span>
                  <span style={{ color: "#0ea5e9", fontWeight: 700, fontSize: "11px" }}>📍 {user.station}</span>
                </>
              )}
            </div>
          </div>

          {/* Tabs header */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid #f1f5f9",
              marginBottom: "14px",
            }}
          >
            <button
              onClick={() => setActiveTab("email")}
              style={{
                padding: "8px 16px",
                fontSize: "12px",
                fontWeight: 700,
                background: "transparent",
                border: "none",
                borderBottom: activeTab === "email" ? "2px solid #0284c7" : "2px solid transparent",
                color: activeTab === "email" ? "#0284c7" : "#64748b",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Mail size={13} />
              Corporate Email Template
            </button>
            <button
              onClick={() => setActiveTab("chat")}
              style={{
                padding: "8px 16px",
                fontSize: "12px",
                fontWeight: 700,
                background: "transparent",
                border: "none",
                borderBottom: activeTab === "chat" ? "2px solid #0284c7" : "2px solid transparent",
                color: activeTab === "chat" ? "#0284c7" : "#64748b",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <MessageSquare size={13} />
              Slack / Teams / WhatsApp
            </button>
          </div>

          {/* Tab Panes */}
          {activeTab === "email" ? (
            <div>
              {/* Email Body Preview */}
              <div style={{ position: "relative" }}>
                <pre
                  style={{
                    margin: 0,
                    background: "#0f172a",
                    color: "#f8fafc",
                    padding: "12px",
                    borderRadius: "8px",
                    fontFamily: "monospace",
                    fontSize: "11px",
                    lineHeight: 1.5,
                    maxHeight: "180px",
                    overflowY: "auto",
                    whiteSpace: "pre-wrap",
                    border: "1px solid #334155",
                  }}
                >
                  {emailBody}
                </pre>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                <a
                  href={mailtoUrl}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    background: "#0284c7",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px",
                    fontSize: "12px",
                    fontWeight: 700,
                    textDecoration: "none",
                    textAlign: "center",
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#0369a1"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "#0284c7"}
                >
                  <ExternalLink size={13} />
                  Open Mail Client
                </a>

                <button
                  onClick={() => handleCopyText(emailBody, "email")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    background: copiedEmail ? "#16a34a" : "#f1f5f9",
                    color: copiedEmail ? "#ffffff" : "#334155",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    padding: "10px 14px",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.2s",
                    minWidth: "130px",
                    justifyContent: "center",
                  }}
                >
                  {copiedEmail ? <Check size={13} /> : <Copy size={13} />}
                  {copiedEmail ? "Copied" : "Copy Template"}
                </button>
              </div>
            </div>
          ) : (
            <div>
              {/* Chat Body Preview */}
              <div style={{ position: "relative" }}>
                <pre
                  style={{
                    margin: 0,
                    background: "#1e293b",
                    color: "#cbd5e1",
                    padding: "12px",
                    borderRadius: "8px",
                    fontFamily: "monospace",
                    fontSize: "11px",
                    lineHeight: 1.5,
                    maxHeight: "180px",
                    overflowY: "auto",
                    whiteSpace: "pre-wrap",
                    border: "1px solid #334155",
                  }}
                >
                  {chatBody}
                </pre>
              </div>

              {/* Action Buttons */}
              <div style={{ marginTop: "16px" }}>
                <button
                  onClick={() => handleCopyText(chatBody, "chat")}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    background: copiedChat ? "#16a34a" : "#0284c7",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => { if(!copiedChat) e.currentTarget.style.background = "#0369a1"; }}
                  onMouseLeave={(e) => { if(!copiedChat) e.currentTarget.style.background = "#0284c7"; }}
                >
                  {copiedChat ? <Check size={13} /> : <Copy size={13} />}
                  {copiedChat ? "Copied Chat Instructions!" : "Copy Msg to Clipboard"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            background: "#f8fafc",
            padding: "12px 20px",
            borderTop: "1px solid #e1e8f0",
            display: "flex",
            justifyContent: "end",
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              color: "#475569",
              padding: "6px 16px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "#f1f5f9"}
            onMouseLeave={(e) => e.currentTarget.style.background = "#ffffff"}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
