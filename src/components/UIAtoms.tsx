/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { T } from "../utils/theme";

interface PillProps {
  text: string;
  color: string;
  textColor?: string;
  style?: React.CSSProperties;
}

export const Pill: React.FC<PillProps> = ({ text, color, textColor = "#000000", style }) => {
  return (
    <span
      style={{
        background: color + "14",
        color: textColor,
        border: `1px solid ${color}29`,
        borderRadius: "9999px", // Bubble style!
        padding: "3px 10px",
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: "nowrap",
        display: "inline-block",
        ...style,
      }}
    >
      {text || "—"}
    </span>
  );
};

interface BadgeProps {
  text: string | number;
  color: string;
  bg: string;
}

export const Badge: React.FC<BadgeProps> = ({ text, color, bg }) => {
  return (
    <span
      style={{
        background: bg,
        color,
        border: `1px solid ${color}44`,
        borderRadius: 12,
        padding: "2px 9px",
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
};

interface FieldProps {
  label: string;
  children: React.ReactNode;
  span?: number;
}

export const Field: React.FC<FieldProps> = ({ label, children, span }) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 5,
        gridColumn: span ? `span ${span}` : undefined,
      }}
    >
      <label
        style={{
          fontSize: 11,
          color: T.textMid,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          fontWeight: 600,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
};

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent: string;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, sub, accent }) => {
  return (
    <div
      style={{
        background: T.surface,
        border: "1px solid #e5e7eb",
        borderRadius: 16, // Beautifully rounded Apple corners
        padding: "16px 20px",
        flex: "1 1 140px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.03)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: accent }} />
      <div style={{ fontSize: 26, fontWeight: 700, color: accent, fontFamily: "inherit" }}>
        {value}
      </div>
      <div
        style={{
          fontSize: 11,
          color: T.textMuted,
          marginTop: 3,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>
      {sub && <div style={{ fontSize: 11, color: T.textMid, marginTop: 1 }}>{sub}</div>}
    </div>
  );
};

interface MiniBarProps {
  data: Array<{ k: string; v: number }>;
  color: string;
}

export const MiniBar: React.FC<MiniBarProps> = ({ data, color }) => {
  if (!data || data.length === 0) {
    return (
      <div
        style={{
          height: 80,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: T.textMuted,
          fontSize: 12,
        }}
      >
        No data
      </div>
    );
  }
  const max = Math.max(...data.map((d) => d.v), 1);
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "flex-end", height: 80 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
          <div
            style={{
              width: "100%",
              background: color,
              height: Math.round((d.v / max) * 64),
              borderRadius: "3px 3px 0 0",
              opacity: 0.7,
              minHeight: 2,
            }}
          />
          <div style={{ fontSize: 9, color: T.textMuted, marginTop: 3, whiteSpace: "nowrap" }}>
            {d.k}
          </div>
        </div>
      ))}
    </div>
  );
};

interface PanelProps {
  title: string;
  children: React.ReactNode;
}

export const Panel: React.FC<PanelProps> = ({ title, children }) => {
  return (
    <div
      style={{
        background: T.surface,
        border: "1px solid #e5e7eb",
        borderRadius: 16, // Beautifully rounded Apple corner
        padding: 16,
        boxShadow: "0 8px 24px rgba(0,0,0,0.03)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: T.textMuted,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 14,
          fontWeight: 600,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
};
