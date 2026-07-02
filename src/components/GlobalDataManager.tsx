/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import { 
  Trash2, 
  AlertTriangle, 
  Search, 
  Filter, 
  Edit3, 
  Check, 
  X, 
  AlertCircle, 
  CheckCircle, 
  Database,
  ArrowUpDown,
  FileSpreadsheet,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen
} from "lucide-react";
import { Shipment } from "../types";
import { T } from "../utils/theme";
import { toDisplay } from "../utils/helpers";

interface GlobalDataManagerProps {
  records: Shipment[];
  onMassDelete: (ids: number[]) => Promise<void>;
  onUpdateShipment: (id: number, fields: Partial<Shipment>) => Promise<void>;
  workspaceId: string;
  onGoToManifestDate?: (date: string) => void;
}

export interface Anomaly {
  field: keyof Shipment;
  severity: "error" | "warning";
  message: string;
}

// Robust helper to check for anomalies in a shipment
export const detectAnomalies = (s: Shipment): Anomaly[] => {
  const anomalies: Anomaly[] = [];

  // 1. Date Check (Format should be DDMMYYYY, length 8)
  const cleanDate = (s.date || "").replace(/\D/g, "");
  if (!s.date) {
    anomalies.push({ field: "date", severity: "error", message: "Date is completely missing" });
  } else if (cleanDate.length !== 8) {
    anomalies.push({ field: "date", severity: "error", message: `Date length is ${cleanDate.length} instead of 8 (must be DDMMYYYY)` });
  } else {
    const day = parseInt(cleanDate.slice(0, 2), 10);
    const month = parseInt(cleanDate.slice(2, 4), 10);
    const year = parseInt(cleanDate.slice(4, 8), 10);
    if (day < 1 || day > 31) {
      anomalies.push({ field: "date", severity: "error", message: `Invalid day: ${day}` });
    }
    if (month < 1 || month > 12) {
      anomalies.push({ field: "date", severity: "error", message: `Invalid month: ${month}` });
    }
    if (year < 2020 || year > 2035) {
      anomalies.push({ field: "date", severity: "warning", message: `Suspicious year: ${year}` });
    }
  }

  // 2. AWB Check (Format: usually prefix (3 digits) - number (8 digits))
  const cleanAwb = (s.awb || "").replace(/[^0-9]/g, "");
  if (!s.awb) {
    anomalies.push({ field: "awb", severity: "error", message: "AWB is completely missing" });
  } else if (cleanAwb.length < 11) {
    anomalies.push({ field: "awb", severity: "warning", message: `AWB is too short (only ${cleanAwb.length} numeric digits, expected 11)` });
  } else if (cleanAwb.length > 11) {
    anomalies.push({ field: "awb", severity: "warning", message: `AWB is too long (has ${cleanAwb.length} digits, standard is 11)` });
  }

  // 3. Flight Check
  const flight = (s.flight || "").toUpperCase().trim();
  const placeholders = ["TBA", "TBC", "PENDING", "LATER", "N/A", "NONE", "N/A", "TBD", "STANDBY", "ASK"];
  if (!flight) {
    anomalies.push({ field: "flight", severity: "error", message: "Flight code is missing" });
  } else if (placeholders.some(p => flight.includes(p))) {
    anomalies.push({ field: "flight", severity: "warning", message: `Placeholder flight specified: "${flight}"` });
  } else if (flight.length < 3) {
    anomalies.push({ field: "flight", severity: "warning", message: `Suspiciously short flight code: "${flight}"` });
  }

  // 4. Shipper Check
  const shipper = (s.shipper || "").toUpperCase().trim();
  if (!shipper) {
    anomalies.push({ field: "shipper", severity: "error", message: "Shipper name is missing" });
  } else if (shipper.length < 2) {
    anomalies.push({ field: "shipper", severity: "error", message: "Shipper name is too short" });
  } else if (["TEST", "MOCK", "SAMPLE", "DUMMY", "X", "BLANK", "XYZ"].includes(shipper)) {
    anomalies.push({ field: "shipper", severity: "warning", message: `Suspicious/Test shipper name: "${shipper}"` });
  }

  // 5. CTO (Cargo Terminal Operator) Check
  const cto = (s.cto || "").toUpperCase().trim();
  if (!cto) {
    anomalies.push({ field: "cto", severity: "warning", message: "CTO is missing" });
  } else if (["TEST", "TBA", "TBC"].includes(cto)) {
    anomalies.push({ field: "cto", severity: "warning", message: `Placeholder CTO: "${cto}"` });
  }

  // 6. Destination Check
  const dest = (s.dest || "").toUpperCase().trim();
  if (!dest) {
    anomalies.push({ field: "dest", severity: "error", message: "Destination is missing" });
  } else if (dest.length !== 3) {
    anomalies.push({ field: "dest", severity: "warning", message: `Destination must ideally be a 3-letter IATA code: "${dest}"` });
  }

  // 7. Unit / Loose type Check
  const loadType = (s.loadType || "").toUpperCase().trim();
  if (loadType !== "UNIT" && loadType !== "LOOSE") {
    anomalies.push({ field: "loadType", severity: "warning", message: `Unknown Load Type: "${loadType}" (expected UNIT or LOOSE)` });
  }

  // 8. Cutoff Check
  const cutoff = (s.cutoff || "").trim();
  if (!cutoff || cutoff === "—" || cutoff === "-") {
    anomalies.push({ field: "cutoff", severity: "warning", message: "Cutoff time is completely missing" });
  } else {
    const cleanCutoff = cutoff.replace(/\D/g, "");
    if (cleanCutoff.length !== 4) {
      anomalies.push({ field: "cutoff", severity: "warning", message: `Cutoff format must be HHMM (e.g., 0720): "${cutoff}"` });
    }
  }

  return anomalies;
};

// Helper to extract Year and Month info from a shipment
export const getYearMonthKey = (r: Shipment) => {
  if (!r.date) {
    return { year: "No Year", month: "No Month", yearNum: 9999, monthNum: 99 };
  }
  const clean = r.date.replace(/\D/g, "");
  if (clean.length === 8) {
    const m = clean.slice(2, 4);
    const y = clean.slice(4, 8);
    
    const yearInt = parseInt(y, 10);
    const monthInt = parseInt(m, 10);
    
    if (yearInt >= 1900 && yearInt <= 2100 && monthInt >= 1 && monthInt <= 12) {
      const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ];
      return {
        year: y,
        month: monthNames[monthInt - 1],
        yearNum: yearInt,
        monthNum: monthInt
      };
    }
  }
  return { year: "Invalid Date", month: "Invalid Month", yearNum: 9998, monthNum: 98 };
};

export const GlobalDataManager: React.FC<GlobalDataManagerProps> = ({
  records,
  onMassDelete,
  onUpdateShipment,
  workspaceId,
  onGoToManifestDate
}) => {
  // Filters & State
  const [searchTerm, setSearchTerm] = useState("");
  const [anomalyFilter, setAnomalyFilter] = useState<"all" | "anomalies" | "healthy" | "wrong_date" | "wrong_awb" | "wrong_flight" | "wrong_shipper" | "wrong_cutoff">("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  
  // Year/Month collapsible folder states
  const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>({});
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});

  // Sort State
  const [sortField, setSortField] = useState<keyof Shipment>("id");
  const [sortAsc, setSortAsc] = useState(false);

  // Buffer state for inline row editing
  const [editBuffer, setEditBuffer] = useState<Partial<Shipment>>({});



  // Anomaly popup modal state
  const [viewingAnomaliesRecord, setViewingAnomaliesRecord] = useState<{
    record: Shipment;
    anomalies: Anomaly[];
  } | null>(null);

  // Memoized cache of anomalies for each record
  const recordsWithAnomalies = useMemo(() => {
    return records.map(r => {
      const anomaliesList = detectAnomalies(r);
      const hasErrors = anomaliesList.some(a => a.severity === "error");
      const hasWarnings = anomaliesList.some(a => a.severity === "warning");
      return {
        record: r,
        anomalies: anomaliesList,
        hasAnomalies: anomaliesList.length > 0,
        hasErrors,
        hasWarnings
      };
    });
  }, [records]);

  // Compute stats
  const stats = useMemo(() => {
    let total = records.length;
    let anomaliesCount = 0;
    let errorsCount = 0;
    let datesCount = 0;
    let awbsCount = 0;
    let flightsCount = 0;
    let shippersCount = 0;
    let cutoffsCount = 0;

    recordsWithAnomalies.forEach(({ record, anomalies, hasAnomalies, hasErrors }) => {
      if (hasAnomalies) anomaliesCount++;
      if (hasErrors) errorsCount++;
      anomalies.forEach(a => {
        if (a.field === "date") datesCount++;
        if (a.field === "awb") awbsCount++;
        if (a.field === "flight") flightsCount++;
        if (a.field === "shipper") shippersCount++;
        if (a.field === "cutoff") cutoffsCount++;
      });
    });

    return {
      total,
      anomaliesCount,
      healthyCount: total - anomaliesCount,
      errorsCount,
      datesCount,
      awbsCount,
      flightsCount,
      shippersCount,
      cutoffsCount
    };
  }, [recordsWithAnomalies]);

  // Handle row sorting
  const handleSort = (field: keyof Shipment) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Filter and Search
  const filteredRecords = useMemo(() => {
    let out = recordsWithAnomalies;

    // Apply Anomaly Filter
    if (anomalyFilter === "anomalies") {
      out = out.filter(x => x.hasAnomalies);
    } else if (anomalyFilter === "healthy") {
      out = out.filter(x => !x.hasAnomalies);
    } else if (anomalyFilter === "wrong_date") {
      out = out.filter(x => x.anomalies.some(a => a.field === "date"));
    } else if (anomalyFilter === "wrong_awb") {
      out = out.filter(x => x.anomalies.some(a => a.field === "awb"));
    } else if (anomalyFilter === "wrong_flight") {
      out = out.filter(x => x.anomalies.some(a => a.field === "flight"));
    } else if (anomalyFilter === "wrong_shipper") {
      out = out.filter(x => x.anomalies.some(a => a.field === "shipper"));
    } else if (anomalyFilter === "wrong_cutoff") {
      out = out.filter(x => x.anomalies.some(a => a.field === "cutoff"));
    }

    // Apply Search Term with intelligent Date parsing to allow searching anything
    if (searchTerm.trim() !== "") {
      const s = searchTerm.toLowerCase().trim();
      const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
      const monthShorts = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

      out = out.filter(x => {
        const r = x.record;
        
        // 1. Match standard textual fields
        const textMatch = (
          (r.awb || "").toLowerCase().includes(s) ||
          (r.shipper || "").toLowerCase().includes(s) ||
          (r.flight || "").toLowerCase().includes(s) ||
          (r.cto || "").toLowerCase().includes(s) ||
          (r.dest || "").toLowerCase().includes(s) ||
          (r.commodity || "").toLowerCase().includes(s) ||
          (r.jobRef || "").toLowerCase().includes(s) ||
          (r.consolRef || "").toLowerCase().includes(s)
        );
        if (textMatch) return true;

        // 2. Intelligent date matching
        if (r.date) {
          const rawDateStr = r.date; // e.g., "28062026"
          const cleanDateStr = rawDateStr.replace(/\D/g, "");
          if (cleanDateStr.length === 8) {
            const d = cleanDateStr.slice(0, 2);
            const m = cleanDateStr.slice(2, 4);
            const y = cleanDateStr.slice(4, 8);
            
            const monthIdx = parseInt(m, 10) - 1;
            const fullMonth = (monthIdx >= 0 && monthIdx < 12) ? monthNames[monthIdx] : "";
            const shortMonth = (monthIdx >= 0 && monthIdx < 12) ? monthShorts[monthIdx] : "";

            const displayDateStr = `${d}/${m}/${y}`;
            const altDisplayStr = `${d}-${m}-${y}`;

            if (
              rawDateStr.includes(s) ||
              displayDateStr.includes(s) ||
              altDisplayStr.includes(s) ||
              y.includes(s) ||
              fullMonth.includes(s) ||
              shortMonth.includes(s) ||
              `${d} ${shortMonth}`.includes(s) ||
              `${d} ${fullMonth}`.includes(s) ||
              `${shortMonth} ${y}`.includes(s) ||
              `${fullMonth} ${y}`.includes(s)
            ) {
              return true;
            }
          } else {
            if (rawDateStr.toLowerCase().includes(s)) return true;
          }
        }
        return false;
      });
    }

    // Apply Sorting
    out.sort((a, b) => {
      let valA = a.record[sortField];
      let valB = b.record[sortField];

      if (valA === undefined || valA === null) valA = "";
      if (valB === undefined || valB === null) valB = "";

      if (typeof valA === "string" && typeof valB === "string") {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else {
        return sortAsc 
          ? (valA as number) - (valB as number) 
          : (valB as number) - (valA as number);
      }
    });

    return out;
  }, [recordsWithAnomalies, anomalyFilter, searchTerm, sortField, sortAsc]);

  const toggleYear = (yr: string) => {
    setExpandedYears(prev => ({
      ...prev,
      [yr]: !prev[yr]
    }));
  };

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths(prev => ({
      ...prev,
      [monthKey]: !prev[monthKey]
    }));
  };

  // Group records by year and month for display
  const groupedYears = useMemo(() => {
    const groups: Record<string, Record<string, typeof filteredRecords>> = {};
    
    filteredRecords.forEach(item => {
      const { year, month } = getYearMonthKey(item.record);
      if (!groups[year]) {
        groups[year] = {};
      }
      if (!groups[year][month]) {
        groups[year][month] = [];
      }
      groups[year][month].push(item);
    });

    const yearList = Object.keys(groups).map(year => {
      const monthsMap = groups[year];
      const monthList = Object.keys(monthsMap).map(month => {
        return {
          month,
          records: monthsMap[month]
        };
      });

      const monthNamesOrder = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ];
      monthList.sort((a, b) => {
        const idxA = monthNamesOrder.indexOf(a.month);
        const idxB = monthNamesOrder.indexOf(b.month);
        if (idxA !== -1 && idxB !== -1) {
          return idxA - idxB;
        }
        return a.month.localeCompare(b.month);
      });

      const totalCount = monthList.reduce((acc, m) => acc + m.records.length, 0);

      let yearNum = 9999;
      if (year === "Invalid Date") yearNum = 9998;
      else if (year === "No Year") yearNum = 9999;
      else yearNum = parseInt(year, 10) || 9999;

      return {
        year,
        yearNum,
        months: monthList,
        totalCount
      };
    });

    // Sort Years descending (most recent years first)
    yearList.sort((a, b) => b.yearNum - a.yearNum);

    return yearList;
  }, [filteredRecords]);

  // Expand and collapse all helpers
  const expandAll = () => {
    const years: Record<string, boolean> = {};
    const months: Record<string, boolean> = {};
    groupedYears.forEach(y => {
      years[y.year] = true;
      y.months.forEach(m => {
        months[`${y.year}-${m.month}`] = true;
      });
    });
    setExpandedYears(years);
    setExpandedMonths(months);
  };

  const collapseAll = () => {
    setExpandedYears({});
    setExpandedMonths({});
  };

  const isSearchActive = searchTerm.trim() !== "" || anomalyFilter !== "all";

  // Checkbox functions
  const handleSelectRow = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(x => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleSelectAllFiltered = () => {
    const allFilteredIds = filteredRecords.map(x => x.record.id);
    const allSelected = allFilteredIds.every(id => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds(selectedIds.filter(id => !allFilteredIds.includes(id)));
    } else {
      // Add missing ones
      const newSelected = [...selectedIds];
      allFilteredIds.forEach(id => {
        if (!newSelected.includes(id)) newSelected.push(id);
      });
      setSelectedIds(newSelected);
    }
  };

  const handleSelectAllAnomalousFiltered = () => {
    const anomalousFilteredIds = filteredRecords
      .filter(x => x.hasAnomalies)
      .map(x => x.record.id);
    
    const allSelected = anomalousFilteredIds.every(id => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds(selectedIds.filter(id => !anomalousFilteredIds.includes(id)));
    } else {
      const newSelected = [...selectedIds];
      anomalousFilteredIds.forEach(id => {
        if (!newSelected.includes(id)) newSelected.push(id);
      });
      setSelectedIds(newSelected);
    }
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
  };

  // Delete Action
  const handleTriggerMassDelete = async () => {
    if (selectedIds.length === 0) return;
    await onMassDelete(selectedIds);
    setSelectedIds([]);
  };

  // Row Inline Edit Actions
  const handleStartEditing = (r: Shipment) => {
    setEditingId(r.id);
    setEditBuffer({ ...r });
  };

  const handleSaveInlineEdit = async (id: number) => {
    await onUpdateShipment(id, editBuffer);
    setEditingId(null);
    setEditBuffer({});
  };

  const handleCancelInlineEdit = () => {
    setEditingId(null);
    setEditBuffer({});
  };

  const handleBufferChange = (field: keyof Shipment, value: any) => {
    setEditBuffer(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px", width: "100%" }}>
      
      {/* Overview Stats Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
        
        {/* Total Shipments Card */}
        <div 
          onClick={() => setAnomalyFilter("all")}
          style={{ 
            background: anomalyFilter === "all" ? "#f0f7ff" : "#ffffff", 
            padding: "16px", 
            borderRadius: "16px", 
            border: anomalyFilter === "all" ? `2.5px solid ${T.accent}` : "1.5px solid #cbd5e1", 
            display: "flex", 
            alignItems: "center", 
            gap: "14px", 
            cursor: "pointer",
            transition: "all 0.15s ease",
            boxShadow: anomalyFilter === "all" ? `0 4px 12px rgba(0,113,227,0.12)` : "0 2px 4px rgba(0,0,0,0.01)"
          }}
          onMouseEnter={(e) => {
            if (anomalyFilter !== "all") {
              e.currentTarget.style.borderColor = T.accent;
              e.currentTarget.style.backgroundColor = "#fafbfe";
            }
          }}
          onMouseLeave={(e) => {
            if (anomalyFilter !== "all") {
              e.currentTarget.style.borderColor = "#cbd5e1";
              e.currentTarget.style.backgroundColor = "#ffffff";
            }
          }}
        >
          <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "#e8f3ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Database style={{ width: "20px", height: "20px", color: T.accent }} />
          </div>
          <div>
            <div style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Total Shipments</div>
            <div style={{ fontSize: "22px", fontWeight: 900, color: "#1e293b" }}>{stats.total}</div>
          </div>
        </div>

        {/* Total Anomalies Card */}
        <div 
          onClick={() => setAnomalyFilter("anomalies")}
          style={{ 
            background: anomalyFilter === "anomalies" ? "#ffebeb" : (stats.anomaliesCount > 0 ? "#fff8f8" : "#ffffff"), 
            padding: "16px", 
            borderRadius: "16px", 
            border: anomalyFilter === "anomalies" ? `2.5px solid ${T.red}` : (stats.anomaliesCount > 0 ? "1.5px solid #fca5a5" : "1.5px solid #cbd5e1"), 
            display: "flex", 
            alignItems: "center", 
            gap: "14px", 
            cursor: "pointer",
            transition: "all 0.15s ease",
            boxShadow: anomalyFilter === "anomalies" ? `0 4px 12px rgba(255,59,48,0.12)` : "0 2px 4px rgba(0,0,0,0.01)"
          }}
          onMouseEnter={(e) => {
            if (anomalyFilter !== "anomalies") {
              e.currentTarget.style.borderColor = T.red;
              e.currentTarget.style.backgroundColor = "#fff5f5";
            }
          }}
          onMouseLeave={(e) => {
            if (anomalyFilter !== "anomalies") {
              e.currentTarget.style.borderColor = stats.anomaliesCount > 0 ? "#fca5a5" : "#cbd5e1";
              e.currentTarget.style.backgroundColor = stats.anomaliesCount > 0 ? "#fff8f8" : "#ffffff";
            }
          }}
        >
          <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "#ffebeb", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <AlertTriangle style={{ width: "20px", height: "20px", color: T.red }} />
          </div>
          <div>
            <div style={{ fontSize: "11px", fontWeight: 800, color: T.red, textTransform: "uppercase" }}>Anomalous Shipments</div>
            <div style={{ fontSize: "22px", fontWeight: 900, color: T.red, display: "flex", alignItems: "center", gap: "6px" }}>
              {stats.anomaliesCount} 
              {stats.errorsCount > 0 && (
                <span style={{ fontSize: "11px", background: T.red, color: "#ffffff", padding: "1px 6px", borderRadius: "8px", fontWeight: 900 }}>
                  {stats.errorsCount} Fatal
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Clean Shipments Card */}
        <div 
          onClick={() => setAnomalyFilter("healthy")}
          style={{ 
            background: anomalyFilter === "healthy" ? "#e8fbe8" : "#ffffff", 
            padding: "16px", 
            borderRadius: "16px", 
            border: anomalyFilter === "healthy" ? `2.5px solid ${T.green}` : "1.5px solid #cbd5e1", 
            display: "flex", 
            alignItems: "center", 
            gap: "14px", 
            cursor: "pointer",
            transition: "all 0.15s ease",
            boxShadow: anomalyFilter === "healthy" ? `0 4px 12px rgba(52,199,89,0.12)` : "0 2px 4px rgba(0,0,0,0.01)"
          }}
          onMouseEnter={(e) => {
            if (anomalyFilter !== "healthy") {
              e.currentTarget.style.borderColor = T.green;
              e.currentTarget.style.backgroundColor = "#f4fdf4";
            }
          }}
          onMouseLeave={(e) => {
            if (anomalyFilter !== "healthy") {
              e.currentTarget.style.borderColor = "#cbd5e1";
              e.currentTarget.style.backgroundColor = "#ffffff";
            }
          }}
        >
          <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "#e8fbe8", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CheckCircle style={{ width: "20px", height: "20px", color: T.green }} />
          </div>
          <div>
            <div style={{ fontSize: "11px", fontWeight: 800, color: T.green, textTransform: "uppercase" }}>Healthy Shipments</div>
            <div style={{ fontSize: "22px", fontWeight: 900, color: "#1e293b" }}>{stats.healthyCount}</div>
          </div>
        </div>
      </div>

      {/* Control Panel: Filters, Search, and Multi-Select Actions */}
      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "18px", padding: "18px", display: "flex", flexDirection: "column", gap: "16px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.02)" }}>
        
        {/* First Row: Search and Quick Filter Toggles */}
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          
          {/* Search Bar */}
          <div style={{ position: "relative", flex: "1 1 300px", minWidth: "240px" }}>
            <Search style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", width: "16px", height: "16px", color: "#64748b" }} />
            <input
              type="text"
              placeholder="Search AWB, Shipper, Flight, Date (e.g. 28/06/2026, June), Destination, Ref..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px 10px 38px",
                borderRadius: "12px",
                border: "1.5px solid #cbd5e1",
                fontSize: "13px",
                outline: "none",
                fontFamily: "inherit",
                transition: "border-color 0.15s ease",
                textTransform: "uppercase"
              }}
              onFocus={(e) => e.target.style.borderColor = "#0284c7"}
              onBlur={(e) => e.target.style.borderColor = "#cbd5e1"}
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm("")}
                style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", border: "none", background: "none", cursor: "pointer", color: "#94a3b8", fontSize: "14px" }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Badges / Dropdown */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: 800, color: "#475569", display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <Filter style={{ width: "13px", height: "13px" }} /> Filter Anomalies:
            </span>
            {[
              { id: "all", label: "All Data", count: stats.total },
              { id: "anomalies", label: "Anomalous", count: stats.anomaliesCount, style: { background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5" } },
              { id: "healthy", label: "🟢 Healthy", count: stats.healthyCount, style: { background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0" } },
              { id: "wrong_date", label: "📅 Bad Dates", count: stats.datesCount },
              { id: "wrong_awb", label: "✈️ Bad AWBs", count: stats.awbsCount },
              { id: "wrong_flight", label: "🛫 Bad Flights", count: stats.flightsCount },
              { id: "wrong_shipper", label: "👤 Bad Shippers", count: stats.shippersCount },
              { id: "wrong_cutoff", label: "⏰ Missing Cutoff", count: stats.cutoffsCount }
            ].map((f) => {
              const isActive = anomalyFilter === f.id;
              const hasItems = f.count > 0;
              return (
                <button
                  key={f.id}
                  onClick={() => setAnomalyFilter(f.id as any)}
                  disabled={!hasItems && f.id !== "all"}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "20px",
                    fontSize: "11px",
                    fontWeight: 800,
                    cursor: hasItems || f.id === "all" ? "pointer" : "not-allowed",
                    border: isActive 
                      ? "1.5px solid #0284c7" 
                      : (f.style?.border || "1px solid #cbd5e1"),
                    backgroundColor: isActive 
                      ? "#e0f2fe" 
                      : (f.style?.background || (hasItems ? "#ffffff" : "#f1f5f9")),
                    color: isActive 
                      ? "#0369a1" 
                      : (f.style?.color || (hasItems ? "#475569" : "#94a3b8")),
                    opacity: hasItems || f.id === "all" ? 1 : 0.4,
                    transition: "all 0.1s ease",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px"
                  }}
                >
                  {f.label} ({f.count})
                </button>
              );
            })}
          </div>
        </div>



        {/* Second Row: Selection Controls & Mass Actions */}
        {selectedIds.length > 0 && (
          <div style={{ display: "flex", gap: "10px", padding: "10px 14px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0", alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#1e293b" }}>
                🗳️ Selected <strong>{selectedIds.length}</strong> items
              </span>
              <button 
                onClick={handleClearSelection}
                style={{ background: "none", border: "none", color: "#0284c7", fontSize: "11px", fontWeight: 800, cursor: "pointer", textDecoration: "underline" }}
              >
                Clear selection
              </button>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={handleTriggerMassDelete}
                style={{
                  background: "#ef4444",
                  color: "#ffffff",
                  border: "none",
                  padding: "8px 14px",
                  borderRadius: "10px",
                  fontSize: "12px",
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 2px 4px rgba(239, 68, 68, 0.2)"
                }}
              >
                <Trash2 style={{ width: "14px", height: "14px" }} />
                Delete Selected Lines ({selectedIds.length})
              </button>
            </div>
          </div>
        )}

        {/* Third Row: Fast selection helpers */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", borderTop: "1px solid #f1f5f9", paddingTop: "12px", alignItems: "center" }}>
          <button
            onClick={handleSelectAllFiltered}
            style={{
              padding: "5px 10px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              backgroundColor: "#f8fafc",
              color: "#334155",
              fontSize: "11px",
              fontWeight: 750,
              cursor: "pointer",
              transition: "all 0.1s ease"
            }}
          >
            Select/Deselect All Filtered ({filteredRecords.length})
          </button>
          
          {filteredRecords.some(x => x.hasAnomalies) && (
            <button
              onClick={handleSelectAllAnomalousFiltered}
              style={{
                padding: "5px 10px",
                borderRadius: "8px",
                border: "1px solid #fca5a5",
                backgroundColor: "#fef2f2",
                color: "#b91c1c",
                fontSize: "11px",
                fontWeight: 750,
                cursor: "pointer",
                transition: "all 0.1s ease"
              }}
            >
              ⚠️ Select All Anomalous ({filteredRecords.filter(x => x.hasAnomalies).length})
            </button>
          )}

          {/* Folder Expansion Controls */}
          {!isSearchActive && filteredRecords.length > 0 && (
            <div style={{ marginLeft: "auto", display: "flex", gap: "6px", alignItems: "center" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>Folders:</span>
              <button
                type="button"
                onClick={expandAll}
                style={{
                  padding: "4px 8px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: "#ffffff",
                  color: "#0f172a",
                  fontSize: "11px",
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px"
                }}
              >
                📂 Expand All
              </button>
              <button
                type="button"
                onClick={collapseAll}
                style={{
                  padding: "4px 8px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: "#ffffff",
                  color: "#0f172a",
                  fontSize: "11px",
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px"
                }}
              >
                📁 Collapse All
              </button>
            </div>
          )}
        </div>
      </div>



      {/* Main Table Spreadsheet Area */}
      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "18px", overflow: "hidden", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.02)" }}>
        
        {/* Table Body & Horizontal Scroll container */}
        <div style={{ overflowX: "auto", width: "100%" }} className="custom-scrollbar">
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1.5px solid #cbd5e1" }}>
                
                {/* Checkbox Column */}
                <th style={{ padding: "14px", width: "40px", textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={filteredRecords.length > 0 && filteredRecords.every(x => selectedIds.includes(x.record.id))}
                    onChange={handleSelectAllFiltered}
                    style={{ cursor: "pointer", width: "15px", height: "15px" }}
                  />
                </th>

                {/* Status Column */}
                <th style={{ padding: "14px 8px", width: "40px", fontSize: "11px", fontWeight: 800, color: "#475569", textTransform: "uppercase" }}>
                  Status
                </th>

                {/* Main Data Fields Headers with Sorting */}
                {[
                  { field: "date", label: "Date (DDMMYYYY)" },
                  { field: "cutoff", label: "Cutoff" },
                  { field: "awb", label: "AWB" },
                  { field: "flight", label: "Flight" },
                  { field: "shipper", label: "Shipper" },
                  { field: "dest", label: "Dest" },
                  { field: "cto", label: "CTO" },
                  { field: "loadType", label: "Load Type" }
                ].map((col) => (
                  <th 
                    key={col.field}
                    onClick={() => handleSort(col.field as any)}
                    style={{ 
                      padding: "14px 10px", 
                      fontSize: "11px", 
                      fontWeight: 800, 
                      color: "#475569", 
                      textTransform: "uppercase",
                      cursor: "pointer",
                      userSelect: "none"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      {col.label}
                      <ArrowUpDown style={{ width: "10px", height: "10px", color: sortField === col.field ? "#0284c7" : "#94a3b8" }} />
                    </div>
                  </th>
                ))}

                {/* Action Column */}
                <th style={{ padding: "14px", textAlign: "center", width: "100px", fontSize: "11px", fontWeight: 800, color: "#475569" }}>
                  ACTIONS
                </th>
              </tr>
            </thead>
            
            <tbody>
              {groupedYears.map((yearGroup) => {
                const isYearExpanded = isSearchActive ? true : (expandedYears[yearGroup.year] ?? false);

                return (
                  <React.Fragment key={yearGroup.year}>
                    {/* Year Folder Header Row */}
                    <tr 
                      onClick={() => toggleYear(yearGroup.year)}
                      style={{ 
                        backgroundColor: "#f1f5f9", 
                        cursor: "pointer", 
                        userSelect: "none",
                        borderBottom: "2px solid #cbd5e1" 
                      }}
                    >
                      <td colSpan={12} style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontWeight: 800, color: "#1e293b", fontSize: "13px" }}>
                          {isYearExpanded ? (
                            <ChevronDown style={{ width: "16px", height: "16px", color: "#64748b" }} />
                          ) : (
                            <ChevronRight style={{ width: "16px", height: "16px", color: "#64748b" }} />
                          )}
                          {isYearExpanded ? (
                            <FolderOpen style={{ width: "18px", height: "18px", color: "#0284c7" }} />
                          ) : (
                            <Folder style={{ width: "18px", height: "18px", color: "#0284c7" }} />
                          )}
                          <span style={{ fontSize: "14px", fontWeight: 800, letterSpacing: "-0.01em" }}>
                            {yearGroup.year === "Invalid Date" || yearGroup.year === "No Year" 
                              ? "⚠️ Invalid / Missing Dates" 
                              : `Year ${yearGroup.year}`}
                          </span>
                          <span style={{ fontSize: "11px", background: "#cbd5e1", color: "#475569", padding: "2px 8px", borderRadius: "10px", fontWeight: 700 }}>
                            {yearGroup.totalCount} {yearGroup.totalCount === 1 ? "Shipment" : "Shipments"}
                          </span>
                          {!isSearchActive && (
                            <span style={{ marginLeft: "auto", fontSize: "11px", color: "#94a3b8", fontWeight: 500 }}>
                              {isYearExpanded ? "Click to Collapse" : "Click to Expand"}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>

                    {isYearExpanded && yearGroup.months.map((monthGroup) => {
                      const monthKey = `${yearGroup.year}-${monthGroup.month}`;
                      const isMonthExpanded = isSearchActive ? true : (expandedMonths[monthKey] ?? false);

                      return (
                        <React.Fragment key={monthKey}>
                          {/* Month Folder Header Row */}
                          <tr 
                            onClick={() => toggleMonth(monthKey)}
                            style={{ 
                              backgroundColor: "#f8fafc", 
                              cursor: "pointer", 
                              userSelect: "none",
                              borderBottom: "1.5px solid #cbd5e1" 
                            }}
                          >
                            <td colSpan={12} style={{ padding: "8px 14px", paddingLeft: "36px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 750, color: "#334155", fontSize: "12.5px" }}>
                                {isMonthExpanded ? (
                                  <ChevronDown style={{ width: "14px", height: "14px", color: "#64748b" }} />
                                ) : (
                                  <ChevronRight style={{ width: "14px", height: "14px", color: "#64748b" }} />
                                )}
                                {isMonthExpanded ? (
                                  <FolderOpen style={{ width: "16px", height: "16px", color: "#0284c7" }} />
                                ) : (
                                  <Folder style={{ width: "16px", height: "16px", color: "#0284c7" }} />
                                )}
                                <span style={{ fontSize: "13px", fontWeight: 750 }}>
                                  {monthGroup.month}
                                </span>
                                <span style={{ fontSize: "10px", background: "#e2e8f0", color: "#64748b", padding: "1px 6px", borderRadius: "8px", fontWeight: 700 }}>
                                  {monthGroup.records.length} {monthGroup.records.length === 1 ? "Shipment" : "Shipments"}
                                </span>
                                {!isSearchActive && (
                                  <span style={{ marginLeft: "auto", fontSize: "10px", color: "#cbd5e1", fontWeight: 500 }}>
                                    {isMonthExpanded ? "Click to Collapse" : "Click to Expand"}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>

                          {isMonthExpanded && monthGroup.records.map(({ record, anomalies, hasAnomalies, hasErrors }) => {
                            const isEditing = editingId === record.id;
                            const isSelected = selectedIds.includes(record.id);

                            // Find anomalies per field for easier inline alerts
                            const getFieldAnomaly = (f: keyof Shipment) => anomalies.find(a => a.field === f);

                            return (
                  <tr 
                    key={record.id} 
                    style={{ 
                      borderBottom: "1px solid #f1f5f9", 
                      backgroundColor: isSelected ? "#f0f9ff" : hasAnomalies ? "#fff8f8" : "transparent",
                      transition: "background-color 0.1s ease"
                    }}
                  >
                    
                    {/* Checkbox */}
                    <td style={{ padding: "12px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleSelectRow(record.id)}
                        style={{ cursor: "pointer", width: "15px", height: "15px" }}
                      />
                    </td>

                    {/* Status Alert Indicator */}
                    <td style={{ padding: "12px 8px", textAlign: "center" }}>
                      {hasAnomalies ? (
                        <div 
                          title={anomalies.map(a => `[${a.field.toUpperCase()}]: ${a.message}`).join("\n")}
                          onClick={() => setViewingAnomaliesRecord({ record, anomalies })}
                          style={{ 
                            display: "inline-flex", 
                            alignItems: "center", 
                            justifyContent: "center", 
                            cursor: "pointer",
                            padding: "4px 8px",
                            borderRadius: "6px",
                            background: hasErrors ? "#fee2e2" : "#fef3c7",
                            border: `1.5px solid ${hasErrors ? "#fecaca" : "#fde68a"}`,
                            transition: "all 0.1s ease",
                            userSelect: "none"
                          }}
                        >
                          {hasErrors ? (
                            <AlertCircle style={{ width: "15px", height: "15px", color: "#ef4444", marginRight: "4px" }} />
                          ) : (
                            <AlertTriangle style={{ width: "15px", height: "15px", color: "#d97706", marginRight: "4px" }} />
                          )}
                          <span style={{ fontSize: "10px", fontWeight: 800, color: hasErrors ? "#991b1b" : "#92400e" }}>
                            {anomalies.length} {anomalies.length === 1 ? "Issue" : "Issues"}
                          </span>
                        </div>
                      ) : (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#ecfdf5", padding: "4px 8px", borderRadius: "6px", border: "1px solid #a7f3d0" }}>
                          <CheckCircle style={{ width: "14px", height: "14px", color: "#10b981" }} />
                          <span style={{ fontSize: "10px", fontWeight: 800, color: "#065f46" }}>Healthy</span>
                        </div>
                      )}
                    </td>

                    {/* DATE COLUMN */}
                    <td style={{ padding: "10px", position: "relative" }}>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editBuffer.date || ""}
                          onChange={(e) => handleBufferChange("date", e.target.value)}
                          maxLength={8}
                          placeholder="DDMMYYYY"
                          style={{
                            padding: "6px 8px",
                            fontSize: "12.5px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            width: "90px"
                          }}
                        />
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          {record.date && onGoToManifestDate ? (
                            <button
                              type="button"
                              onClick={() => onGoToManifestDate(record.date!)}
                              title="Click to view Cargo Manifest for this date"
                              style={{
                                background: "none",
                                border: "none",
                                padding: 0,
                                margin: 0,
                                textAlign: "left",
                                fontSize: "12.5px", 
                                fontWeight: 800, 
                                color: getFieldAnomaly("date") ? "#dc2626" : T.accent,
                                textDecoration: "underline",
                                textDecorationStyle: "dotted",
                                cursor: "pointer",
                                transition: "all 0.1s ease",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.color = "#0284c7";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.color = getFieldAnomaly("date") ? "#dc2626" : T.accent;
                              }}
                            >
                              {toDisplay(record.date)}
                            </button>
                          ) : (
                            <span style={{ 
                              fontSize: "12.5px", 
                              fontWeight: 750, 
                              color: getFieldAnomaly("date") ? "#dc2626" : "#334155"
                            }}>
                              {record.date ? toDisplay(record.date) : "—"}
                            </span>
                          )}
                          <span style={{ fontSize: "10px", color: "#94a3b8", fontFamily: "monospace" }}>
                            Raw: {record.date || "EMPTY"}
                          </span>
                          {getFieldAnomaly("date") && (
                            <span 
                              onClick={() => setViewingAnomaliesRecord({ record, anomalies })}
                              style={{ fontSize: "9px", color: "#dc2626", fontWeight: 700, marginTop: "2px", cursor: "pointer", textDecoration: "underline" }}
                            >
                              ⚠️ {getFieldAnomaly("date")?.message}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* CUTOFF COLUMN */}
                    <td style={{ padding: "10px" }}>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editBuffer.cutoff || ""}
                          onChange={(e) => handleBufferChange("cutoff", e.target.value)}
                          maxLength={4}
                          placeholder="HHMM"
                          style={{
                            padding: "6px 8px",
                            fontSize: "12.5px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            width: "70px",
                            fontFamily: "monospace"
                          }}
                        />
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ 
                            fontSize: "12.5px", 
                            fontWeight: 800, 
                            color: getFieldAnomaly("cutoff") ? "#dc2626" : "#1e293b",
                            fontFamily: "monospace"
                          }}>
                            {record.cutoff || "—"}
                          </span>
                          {getFieldAnomaly("cutoff") && (
                            <span 
                              onClick={() => setViewingAnomaliesRecord({ record, anomalies })}
                              style={{ fontSize: "9px", color: "#dc2626", fontWeight: 700, marginTop: "2px", cursor: "pointer", textDecoration: "underline" }}
                            >
                              ⚠️ {getFieldAnomaly("cutoff")?.message}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* AWB COLUMN */}
                    <td style={{ padding: "10px" }}>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editBuffer.awb || ""}
                          onChange={(e) => handleBufferChange("awb", e.target.value)}
                          style={{
                            padding: "6px 8px",
                            fontSize: "12.5px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            width: "120px",
                            textTransform: "uppercase"
                          }}
                        />
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ 
                            fontSize: "12.5px", 
                            fontWeight: 750, 
                            color: getFieldAnomaly("awb") ? "#b45309" : "#334155",
                            fontFamily: "monospace"
                          }}>
                            {record.awb || "—"}
                          </span>
                          {getFieldAnomaly("awb") && (
                            <span 
                              onClick={() => setViewingAnomaliesRecord({ record, anomalies })}
                              style={{ fontSize: "9px", color: "#b45309", fontWeight: 700, marginTop: "2px", cursor: "pointer", textDecoration: "underline" }}
                            >
                              ⚠️ {getFieldAnomaly("awb")?.message}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* FLIGHT COLUMN */}
                    <td style={{ padding: "10px" }}>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editBuffer.flight || ""}
                          onChange={(e) => handleBufferChange("flight", e.target.value)}
                          style={{
                            padding: "6px 8px",
                            fontSize: "12.5px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            width: "80px",
                            textTransform: "uppercase"
                          }}
                        />
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ 
                            fontSize: "12.5px", 
                            fontWeight: 800, 
                            color: getFieldAnomaly("flight") ? "#b45309" : "#0284c7"
                          }}>
                            {record.flight || "—"}
                          </span>
                          {getFieldAnomaly("flight") && (
                            <span 
                              onClick={() => setViewingAnomaliesRecord({ record, anomalies })}
                              style={{ fontSize: "9px", color: "#b45309", fontWeight: 700, marginTop: "2px", cursor: "pointer", textDecoration: "underline" }}
                            >
                              ⚠️ {getFieldAnomaly("flight")?.message}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* SHIPPER COLUMN */}
                    <td style={{ padding: "10px" }}>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editBuffer.shipper || ""}
                          onChange={(e) => handleBufferChange("shipper", e.target.value)}
                          style={{
                            padding: "6px 8px",
                            fontSize: "12.5px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            width: "160px",
                            textTransform: "uppercase"
                          }}
                        />
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ 
                            fontSize: "12.5px", 
                            fontWeight: 700, 
                            color: getFieldAnomaly("shipper") ? "#dc2626" : "#334155",
                            whiteSpace: "nowrap",
                            textOverflow: "ellipsis",
                            overflow: "hidden",
                            maxWidth: "180px"
                          }}>
                            {record.shipper || "—"}
                          </span>
                          {getFieldAnomaly("shipper") && (
                            <span 
                              onClick={() => setViewingAnomaliesRecord({ record, anomalies })}
                              style={{ fontSize: "9px", color: "#dc2626", fontWeight: 700, marginTop: "2px", cursor: "pointer", textDecoration: "underline" }}
                            >
                              ⚠️ {getFieldAnomaly("shipper")?.message}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* DESTINATION COLUMN */}
                    <td style={{ padding: "10px" }}>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editBuffer.dest || ""}
                          onChange={(e) => handleBufferChange("dest", e.target.value)}
                          maxLength={3}
                          style={{
                            padding: "6px 8px",
                            fontSize: "12.5px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            width: "55px",
                            textTransform: "uppercase"
                          }}
                        />
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ 
                            fontSize: "12.5px", 
                            fontWeight: 800, 
                            color: getFieldAnomaly("dest") ? "#b45309" : "#475569"
                          }}>
                            {record.dest || "—"}
                          </span>
                          {getFieldAnomaly("dest") && (
                            <span 
                              onClick={() => setViewingAnomaliesRecord({ record, anomalies })}
                              style={{ fontSize: "9px", color: "#b45309", fontWeight: 700, marginTop: "2px", cursor: "pointer", textDecoration: "underline" }}
                            >
                              ⚠️ {getFieldAnomaly("dest")?.message}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* CTO COLUMN */}
                    <td style={{ padding: "10px" }}>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editBuffer.cto || ""}
                          onChange={(e) => handleBufferChange("cto", e.target.value)}
                          style={{
                            padding: "6px 8px",
                            fontSize: "12.5px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            width: "90px",
                            textTransform: "uppercase"
                          }}
                        />
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ 
                            fontSize: "12px", 
                            fontWeight: 700, 
                            color: getFieldAnomaly("cto") ? "#b45309" : "#475569"
                          }}>
                            {record.cto || "—"}
                          </span>
                          {getFieldAnomaly("cto") && (
                            <span 
                              onClick={() => setViewingAnomaliesRecord({ record, anomalies })}
                              style={{ fontSize: "9px", color: "#b45309", fontWeight: 700, marginTop: "2px", cursor: "pointer", textDecoration: "underline" }}
                            >
                              ⚠️ {getFieldAnomaly("cto")?.message}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* LOAD TYPE COLUMN */}
                    <td style={{ padding: "10px" }}>
                      {isEditing ? (
                        <select
                          value={editBuffer.loadType || ""}
                          onChange={(e) => handleBufferChange("loadType", e.target.value)}
                          style={{
                            padding: "6px 8px",
                            fontSize: "12.5px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            width: "90px"
                          }}
                        >
                          <option value="UNIT">UNIT</option>
                          <option value="LOOSE">LOOSE</option>
                        </select>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ 
                            fontSize: "11px", 
                            fontWeight: 800, 
                            padding: "2px 6px", 
                            borderRadius: "6px", 
                            background: record.loadType === "UNIT" ? "#eff6ff" : "#f5f5f7",
                            color: record.loadType === "UNIT" ? "#1d4ed8" : "#475569",
                            alignSelf: "flex-start"
                          }}>
                            {record.loadType || "—"}
                          </span>
                          {getFieldAnomaly("loadType") && (
                            <span 
                              onClick={() => setViewingAnomaliesRecord({ record, anomalies })}
                              style={{ fontSize: "9px", color: "#b45309", fontWeight: 700, marginTop: "2px", cursor: "pointer", textDecoration: "underline" }}
                            >
                              ⚠️ {getFieldAnomaly("loadType")?.message}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* ACTIONS COLUMN */}
                    <td style={{ padding: "12px", textAlign: "center" }}>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => handleSaveInlineEdit(record.id)}
                              title="Save Changes"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: "28px",
                                height: "28px",
                                borderRadius: "8px",
                                border: "none",
                                background: "#10b981",
                                color: "#ffffff",
                                cursor: "pointer"
                              }}
                            >
                              <Check style={{ width: "14px", height: "14px" }} />
                            </button>
                            <button
                              onClick={handleCancelInlineEdit}
                              title="Cancel"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: "28px",
                                height: "28px",
                                borderRadius: "8px",
                                border: "none",
                                background: "#ef4444",
                                color: "#ffffff",
                                cursor: "pointer"
                              }}
                            >
                              <X style={{ width: "14px", height: "14px" }} />
                            </button>
                          </>
                        ) : (
                          <div style={{ display: "flex", gap: "6px", alignItems: "center", justifyContent: "center" }}>
                            <button
                              onClick={() => handleStartEditing(record)}
                              title="Edit Inline"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: "28px",
                                height: "28px",
                                borderRadius: "8px",
                                border: "1px solid #e2e8f0",
                                background: "#ffffff",
                                color: "#475569",
                                cursor: "pointer"
                              }}
                            >
                              <Edit3 style={{ width: "13px", height: "13px" }} />
                            </button>

                            {confirmDeleteId === record.id ? (
                              <div style={{ display: "flex", gap: "3px", alignItems: "center" }}>
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    await onMassDelete([record.id]);
                                    setConfirmDeleteId(null);
                                  }}
                                  style={{
                                    padding: "4px 8px",
                                    borderRadius: "4px",
                                    backgroundColor: "#dc2626",
                                    color: "#ffffff",
                                    fontSize: "11px",
                                    fontWeight: 800,
                                    border: "none",
                                    cursor: "pointer"
                                  }}
                                >
                                  Sure?
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDeleteId(null);
                                  }}
                                  style={{
                                    padding: "4px 8.5px",
                                    borderRadius: "4px",
                                    backgroundColor: "#cbd5e1",
                                    color: "#334155",
                                    fontSize: "11px",
                                    border: "none",
                                    cursor: "pointer"
                                  }}
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDeleteId(record.id);
                                }}
                                title="Delete"
                                style={{
                                  background: T.redBg,
                                  border: `1px solid #fecaca`,
                                  color: T.red,
                                  borderRadius: 4,
                                  padding: "3px 8px",
                                  cursor: "pointer",
                                  fontSize: 11,
                                  display: "inline-flex",
                                  alignItems: "center"
                                }}
                              >
                                Del
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              })}

              {filteredRecords.length === 0 && (
                <tr>
                  <td colSpan={12} style={{ padding: "40px", textShadow: "none", fontSize: "13px", color: "#64748b", textAlign: "center", background: "#f8fafc" }}>
                    No shipments found matching the criteria. Click "All Data" or clear your search to reset.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Table footer showing row summary */}
        <div style={{ background: "#f8fafc", padding: "12px 18px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#64748b" }}>
            Showing {filteredRecords.length} of {records.length} shipments
          </span>
          {anomalyFilter !== "all" && (
            <button 
              onClick={() => { setAnomalyFilter("all"); setSearchTerm(""); }}
              style={{ background: "none", border: "none", color: "#0284c7", fontSize: "11.5px", fontWeight: 800, cursor: "pointer" }}
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Anomalies Detail Modal */}
      {viewingAnomaliesRecord && (
        <div 
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "20px"
          }}
          onClick={() => setViewingAnomaliesRecord(null)}
        >
          <div 
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "520px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              border: "1px solid #e2e8f0",
              overflow: "hidden"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              padding: "16px 20px",
              borderBottom: "1px solid #f1f5f9",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "#f8fafc"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <AlertTriangle style={{ width: "18px", height: "18px", color: "#f59e0b" }} />
                <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: "#1e293b" }}>
                  Anomalous Shipment Details
                </h3>
              </div>
              <button 
                onClick={() => setViewingAnomaliesRecord(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#94a3b8",
                  fontSize: "18px",
                  cursor: "pointer",
                  padding: "4px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  outline: "none"
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Shipment Brief */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: "#f1f5f9", padding: "12px 16px", borderRadius: "10px", fontSize: "12.5px" }}>
                <div><span style={{ color: "#64748b" }}>AWB No:</span> <strong style={{ fontFamily: "monospace" }}>{viewingAnomaliesRecord.record.awb || "—"}</strong></div>
                <div><span style={{ color: "#64748b" }}>Flight:</span> <strong>{viewingAnomaliesRecord.record.flight || "—"}</strong></div>
                <div><span style={{ color: "#64748b" }}>Date:</span> <strong>{viewingAnomaliesRecord.record.date ? toDisplay(viewingAnomaliesRecord.record.date) : "—"}</strong></div>
                <div><span style={{ color: "#64748b" }}>Shipper:</span> <strong style={{ textTransform: "uppercase" }}>{viewingAnomaliesRecord.record.shipper || "—"}</strong></div>
              </div>

              {/* Anomalies List */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#475569" }}>
                  Detected validation issues ({viewingAnomaliesRecord.anomalies.length}):
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "240px", overflowY: "auto" }}>
                  {viewingAnomaliesRecord.anomalies.map((anom, idx) => (
                    <div 
                      key={idx}
                      style={{
                        display: "flex",
                        gap: "10px",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        background: anom.severity === "error" ? "#fef2f2" : "#fffbeb",
                        border: `1px solid ${anom.severity === "error" ? "#fecaca" : "#fef3c7"}`
                      }}
                    >
                      <AlertCircle style={{ width: "16px", height: "16px", color: anom.severity === "error" ? "#ef4444" : "#f59e0b", flexShrink: 0, marginTop: "1px" }} />
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <span style={{ fontSize: "10px", fontWeight: 850, color: "#475569", textTransform: "uppercase" }}>
                          Field: {anom.field} ({anom.severity})
                        </span>
                        <span style={{ fontSize: "12px", color: anom.severity === "error" ? "#991b1b" : "#92400e", fontWeight: 600 }}>
                          {anom.message}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: "14px 20px",
              borderTop: "1px solid #f1f5f9",
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              background: "#f8fafc"
            }}>
              <button
                onClick={() => {
                  handleStartEditing(viewingAnomaliesRecord.record);
                  setViewingAnomaliesRecord(null);
                }}
                style={{
                  background: "#0284c7",
                  color: "#ffffff",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "12.5px",
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px"
                }}
              >
                ✏️ Edit Inline
              </button>
              <button
                onClick={() => setViewingAnomaliesRecord(null)}
                style={{
                  background: "#ffffff",
                  color: "#334155",
                  border: "1px solid #cbd5e1",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "12.5px",
                  fontWeight: 800,
                  cursor: "pointer"
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
