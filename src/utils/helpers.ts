/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const toDisplay = (v: string): string => {
  if (!v) return "";
  const s = v.replace(/\D/g, "");
  if (s.length === 8) {
    return `${s.slice(0, 2)}/${s.slice(2, 4)}/${s.slice(4)}`;
  }
  return v;
};

export const formatAwb = (val: string, prevVal: string = ""): string => {
  if (!val) return "";
  const clean = val.replace(/[^A-Za-z0-9]/g, "");
  const isDeleting = val.length < prevVal.length;

  if (isDeleting) {
    if (clean.length > 3) {
      return `${clean.slice(0, 3)}-${clean.slice(3)}`;
    }
    return clean;
  }

  if (clean.length > 3) {
    return `${clean.slice(0, 3)}-${clean.slice(3)}`;
  } else if (clean.length === 3) {
    return `${clean}-`;
  }
  return clean;
};

export const getAirlineForFlight = (flightCode: string): string => {
  if (!flightCode) return "";
  const prefix = flightCode.slice(0, 2).toUpperCase();
  switch (prefix) {
    case "BI": return "Royal Brunei Airlines";
    case "CA": return "Air China";
    case "CI": return "China Airlines";
    case "CX": return "Cathay Pacific";
    case "D7": return "AirAsia X";
    case "DL": return "Delta Air Lines";
    case "EK": return "Emirates";
    case "EY": return "Etihad Airways";
    case "GA": return "Garuda Indonesia";
    case "HJ": return "Tasman Cargo";
    case "HO": return "Juneyao Airlines";
    case "HX": return "Hong Kong Airlines";
    case "JD": return "Capital Airlines";
    case "JL": return "Japan Airlines";
    case "JQ": return "Jetstar Airways";
    case "MF": return "XiamenAir";
    case "MH": return "Malaysia Airlines";
    case "MU": return "China Eastern";
    case "NH": return "All Nippon Airways";
    case "NZ": return "Air New Zealand";
    case "OZ": return "Asiana Airlines";
    case "PR": return "Philippine Airlines";
    case "QF": return "Qantas";
    case "QR": return "Qatar Airways";
    case "SQ": return "Singapore Airlines";
    case "TG": return "Thai Airways";
    case "TK": return "Turkish Airlines";
    case "TR": return "Scoot";
    case "UA": return "United Airlines";
    case "UL": return "SriLankan Airlines";
    case "VA": return "Virgin Australia";
    case "VJ": return "VietJet Air";
    case "VN": return "Vietnam Airlines";
    case "5J": return "Cebu Pacific";
    case "AI": return "Air India";
    case "CZ": return "China Southern";
    default: return "";
  }
};

export const getDayOfWeek = (v: string): string => {
  if (!v || v.replace(/\D/g, "").length !== 8) return "";
  const s = v.replace(/\D/g, "");
  const day = parseInt(s.slice(0, 2), 10);
  const month = parseInt(s.slice(2, 4), 10) - 1; // 0-indexed month
  const year = parseInt(s.slice(4), 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return "";
  const dateObj = new Date(year, month, day);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[dateObj.getDay()] || "";
};

export const julianToDate = (j: string): string => {
  try {
    const n = parseInt(j, 10);
    if (isNaN(n)) return j;
    // Excel base date starts at Jan 1, 1900
    const d = new Date((n - 25569) * 86400000);
    const day = String(d.getUTCDate()).padStart(2, "0");
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const year = String(d.getUTCFullYear());
    return `${day}${month}${year}`;
  } catch {
    return j;
  }
};

export const subtractHour = (t: string): string => {
  if (!t || t.length < 3) return t;
  const p = t.padStart(4, "0");
  const h = parseInt(p.slice(0, 2), 10);
  const newHour = String(h === 0 ? 23 : h - 1).padStart(2, "0");
  return newHour + p.slice(2);
};

export const todayStr = (): string => {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear());
  return `${day}${month}${year}`;
};

export const getFlightWithDateSuffix = (flightCode: string, dateStr: string): string => {
  let result = flightCode || "";
  if (dateStr && dateStr.length >= 2) {
    const dayNum = parseInt(dateStr.slice(0, 2), 10);
    if (!isNaN(dayNum)) {
      const suffixes = ["th", "st", "nd", "rd"];
      const val = dayNum % 100;
      const suffix = suffixes[(val - 20) % 10] || suffixes[val] || suffixes[0];
      result += `/${dayNum}${suffix}`;
    }
  }
  return result;
};

export const generateJobSheetHtml = (row: any): string => {
  const firstFlight = getFlightWithDateSuffix(row.flight || "", row.date || "").toUpperCase();
  const equipmentUsed = (row.uld || "").toUpperCase();
  const shipper = (row.shipper || "").toUpperCase();
  const secondFlight = (row.secondFlight || "").toUpperCase();
  const awb = (row.awb || "").toUpperCase();
  const dest = (row.dest || "").toUpperCase();
  const consolRef = (row.consolRef || "").toUpperCase();
  const jobRef = (row.jobRef || "").toUpperCase();
  const specialInst = (row.specialInst || "").toUpperCase();
  
  const titleBoxSt = `text-align:center;font-size:20px;font-weight:900;border:4px solid #000;padding:10px;margin-bottom:12px;letter-spacing:3px;text-transform:uppercase;background:#fff !important;color:#000 !important;`;
  const gridBoxSt = `border:4px solid #000000;overflow:hidden;background:#fff !important;display:flex;flex-direction:column;text-transform:uppercase;box-sizing:border-box;`;
  
  const row3St = `display:grid;grid-template-columns: 6fr 3fr 3fr;border-bottom:4px solid #000000;min-height:85px;`;
  const rowAwdUnitDestSt = `display:grid;grid-template-columns: 5fr 5fr 2fr;border-bottom:4px solid #000000;min-height:85px;`;
  const row2St = `display:grid;grid-template-columns: 1fr 1fr;border-bottom:4px solid #000000;min-height:75px;`;
  
  const labelBlockSt = `background:#000000 !important;color:#ffffff !important;font-weight:bold;font-size:13px;padding:6px 10px;border-bottom:2px solid #000;text-transform:uppercase;font-family:monospace;letter-spacing:1px;-webkit-print-color-adjust: exact !important;print-color-adjust: exact !important;`;
  const valueBlockSt = `flex:1;padding:8px;font-size:14px;font-weight:900;text-transform:uppercase;color:#000 !important;white-space:pre-wrap;background:#fff !important;`;
  
  const cellBrSt = `display:flex;flex-direction:column;border-right:4px solid #000000;`;
  const cellSt = `display:flex;flex-direction:column;`;
  const instRowSt = `display:flex;flex-direction:column;min-height:140px;`;

  return `
    <div class="job-sheet-page" style="padding: 18px; font-family: Arial, sans-serif; color: #000; background: #fff; text-transform: uppercase; box-sizing: border-box; page-break-after: always; page-break-inside: avoid; break-after: page; break-inside: avoid;">
      <div class="title-box" style="${titleBoxSt}">SEAWAY</div>
      <div class="grid-box" style="${gridBoxSt}">
        
         <!-- Row 1: Shipper, 1st Flight, 2nd Flight -->
        <div class="row-split-3" style="${row3St}">
          <div class="cell cell-br" style="${cellBrSt}">
            <div class="label-block" style="${labelBlockSt}">SHIPPER</div>
            <div class="value-block" style="${valueBlockSt}">${shipper}</div>
          </div>
          <div class="cell cell-br" style="${cellBrSt}">
            <div class="label-block" style="${labelBlockSt}">1ST FLIGHT / DATE</div>
            <div class="value-block" style="${valueBlockSt}">${firstFlight}</div>
          </div>
          <div class="cell" style="${cellSt}">
            <div class="label-block" style="${labelBlockSt}">2ND FLIGHT</div>
            <div class="value-block" style="${valueBlockSt}">${secondFlight}</div>
          </div>
        </div>

        <!-- Row 2: AWB, Unit/ULD/Equipment, DEST -->
        <div class="row-split-awb-unit-dest" style="${rowAwdUnitDestSt}">
          <div class="cell cell-br" style="${cellBrSt}">
            <div class="label-block" style="${labelBlockSt}">AWB</div>
            <div class="value-block" style="${valueBlockSt}">${awb}</div>
          </div>
          <div class="cell cell-br" style="${cellBrSt}">
            <div class="label-block" style="${labelBlockSt}">UNIT / ULD (EQUIPMENT USED)</div>
            <div class="value-block" style="${valueBlockSt}">${equipmentUsed}</div>
          </div>
          <div class="cell" style="${cellSt}">
            <div class="label-block" style="${labelBlockSt}">DEST</div>
            <div class="value-block" style="${valueBlockSt}">${dest}</div>
          </div>
        </div>

        <!-- Row 3: Consol Ref & Job Ref -->
        <div class="row-split-2" style="${row2St}">
          <div class="cell cell-br" style="${cellBrSt}">
            <div class="label-block" style="${labelBlockSt}">CONSOL REF</div>
            <div class="value-block" style="${valueBlockSt}">${consolRef}</div>
          </div>
          <div class="cell" style="${cellSt}">
            <div class="label-block" style="${labelBlockSt}">JOB REF</div>
            <div class="value-block" style="${valueBlockSt}">${jobRef}</div>
          </div>
        </div>

        <!-- Special instructions block -->
        <div class="inst-row" style="${instRowSt}">
          <div class="label-block" style="${labelBlockSt}">SPECIAL INSTRUCTIONS</div>
          <div class="value-block" style="${valueBlockSt} font-size:13px; line-height:1.5;">${specialInst}</div>
        </div>

      </div>
    </div>
  `;
};

export const getAvailableCtos = (): string[] => {
  return ["MENZIES", "SWISSPORT", "QANTAS", "DNATA"];
};

export const addCustomCto = (cto: string) => {
  // No-op. Custom CTOs are one-off for the specific job/manifest only and are not added to list of saved CTOs.
};

