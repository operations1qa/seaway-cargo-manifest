/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const T = {
  bg: "#f5f5f7",          // Apple soft light grey editor background
  surface: "#ffffff",     // Clean pure white for high contrast cards
  surface2: "#f9fafb",    // Warm off-white
  border: "#e5e7eb",      // Very clean, light borders
  border2: "#f3f4f6",     // Sub-borders
  text: "#1d1d1f",        // Apple standard deep text
  textMid: "#515154",     // Apple mid grey
  textMuted: "#86868b",   // Apple muted grey
  accent: "#0071e3",      // Apple signature blue
  accentBg: "#e8f3ff",    // Highlighted soft blue selection
  header: "#ffffff",      // Pure white bright header
  green: "#34c759",       // Apple green
  greenBg: "#e8fbe8",     // Warm soft green bg
  red: "#ff3b30",         // Apple red
  redBg: "#ffebeb",       // Warm soft red bg
  amber: "#ff9500",       // Apple orange/amber
  amberBg: "#fff4e5",     // Warm soft amber bg
};

export const CC: { [key: string]: string } = {
  "CHILLED MEAT": "#0071e3",
  "CHILLED DAIRY": "#0891b2",
  "DAIRY": "#0891b2",
  "CH DAIRY": "#0891b2",
  "FROZEN MEAT": "#8f3bf0",
  "FROZEN LAMB": "#8f3bf0",
  "FROZEN BEEF": "#8f3bf0",
  "CARCASES": "#ff9500",
  "CARCASSES": "#ff9500",
  "CCS": "#ff9500",
  "PRODUCE": "#34c759",
  "SALAD MIX": "#34c759",
  "SALADS": "#34c759",
  "GRAPES": "#8f3bf0",
  "CHERRIES": "#ff3b30",
  "SALMON": "#ff9500",
  "LOBSTERS": "#ff9500",
  "CHILLED SEAFOOD": "#ff9500",
};

export const cCol = (c: string): string => {
  if (!c) return "#86868b";
  return CC[c.toUpperCase()] || "#86868b";
};

export const INP = {
  background: T.surface,
  border: "1px solid #d2d2d7",  // Apple input border
  borderRadius: "12px",        // Bubbly!
  color: T.text,
  padding: "9px 14px",         // Spacious, rounded feel
  fontSize: "13px",
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box" as const,
  outline: "none",
  textTransform: "uppercase" as const, // Force client-side uppercase typing display
};

export const SEL = {
  ...INP,
  cursor: "pointer",
};
