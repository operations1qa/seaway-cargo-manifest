/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { Plus, Trash2, Edit, ArrowLeft, Save } from "lucide-react";
import { Shipment } from "../types";
import { T } from "../utils/theme";
import { toDisplay, todayStr, getDayOfWeek, formatAwb } from "../utils/helpers";
import { doc, getDoc, setDoc, deleteDoc, collection, onSnapshot, query, where } from "firebase/firestore";
import { auth, db, OperationType, handleFirestoreError } from "../lib/firebase";

const PORT_CITIES: Record<string, string> = {
  ALL: "All Ports",
  MEL: "Melbourne",
  SYD: "Sydney",
  BNE: "Brisbane",
  CNS: "Cairns",
  PER: "Perth",
  ADL: "Adelaide"
};

interface LoadsheetModalProps {
  row: Shipment;
  onClose: () => void;
  currentUser?: { uid: string; displayName: string; email: string } | null;
  offlineMode?: boolean;
  onUpdateShipment?: (id: number, fields: Partial<Shipment>) => void;
  isAdmin?: boolean;
  activePort?: string;
}

interface CargoRow {
  grn: string;
  skd: string;
  count: string;
  desc: string;
  weight: string;
  picked: boolean;
  checked: boolean;
}

export const LoadsheetModal: React.FC<LoadsheetModalProps> = ({ row, onClose, currentUser, offlineMode, onUpdateShipment, isAdmin = false, activePort = "MEL" }) => {
  const printRef = useRef<HTMLDivElement>(null);

  // Pre-fill exactly 11 blank cargo rows, leaving all fields blank on creation
  const getInitialCargoRows = (): CargoRow[] => {
    return Array(11).fill(null).map(() => ({
      grn: "", skd: "", count: "", desc: "", weight: "", picked: false, checked: false
    }));
  };

  // Check for autosaved Loadsheet data for this shipment
  const savedData = (() => {
    try {
      const stored = localStorage.getItem(`loadsheet_autosave_v2_${row.id}`);
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  })();

  const [ls, setLs] = useState(() => {
    const parentUld = row.uld || "";
    if (savedData?.ls) {
      const loadedLs = { ...savedData.ls };
      const savedParentUld = savedData.parentUld || "";
      if (savedParentUld !== parentUld) {
        loadedLs.uld = parentUld;
        loadedLs.unitsLine2 = parentUld;
      }
      // Ensure there are at least 11 cargo rows
      if (loadedLs.cargoRows && loadedLs.cargoRows.length < 11) {
        const diff = 11 - loadedLs.cargoRows.length;
        const extra = Array(diff).fill(null).map(() => ({
          grn: "", skd: "", count: "", desc: "", weight: "", picked: false, checked: false
        }));
        loadedLs.cargoRows = [...loadedLs.cargoRows, ...extra];
      }
      return loadedLs;
    }
    return {
      operator: row.operator || "",
      mawb: row.awb || "",
      cutoffDay: row.date ? `${getDayOfWeek(row.date).toUpperCase()} - ${toDisplay(row.date)}` : "",
      cutoffTime: row.cutoff || "",
      shipper: row.shipper || "",
      flight: row.flight || "",
      destination: row.dest || "",
      dryIceYes: !!row.ice,
      dryIceNo: !row.ice,
      dryIceAmount: row.ice || "",
      sealsYes: false,
      sealsNo: true,
      inspectionAt: "",
      foilYes: false,
      foilNo: true,
      tempRecorderYes: false,
      tempRecorderNo: true,
      cargoRows: getInitialCargoRows(),
      unitsLine2: parentUld,
      customSpecialInstructions: "",
      loadIn: "",
      loadInTemp1: "",
      loadInTemp2: "",
      loadInTemp3: "",
      loadOut: "",
      loadOutTemp1: "",
      loadOutTemp2: "",
      loadOutTemp3: "",
      pickedBy: "", checkedBy: "", loadedBy: "",
      dateIn: "",
      dateOut: "",
      commodity: row.commodity || "",
      cto: row.cto || "",
      uld: parentUld,
      ice: row.ice || "",
      scr: row.scr || "",
    };
  });

  const [includeCarcases, setIncludeCarcases] = useState(() => {
    if (savedData && typeof savedData.includeCarcases === "boolean") {
      return savedData.includeCarcases;
    }
    return (row.commodity || "").toUpperCase().includes("CARCASE");
  });

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  
  // Emailing method process states
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [emailTarget, setEmailTarget] = useState<"cargowise" | "user">("cargowise");
  const [emailConsolRef, setEmailConsolRef] = useState(row.consolRef || "");
  const [emailJobRef, setEmailJobRef] = useState(row.jobRef || "");
  const [emailType, setEmailType] = useState<"CON" | "SHP">(() => {
    return row.consolRef ? "CON" : "SHP";
  });

  useEffect(() => {
    setEmailConsolRef(row.consolRef || "");
    setEmailJobRef(row.jobRef || "");
    if (row.consolRef) {
      setEmailType("CON");
    } else if (row.jobRef) {
      setEmailType("SHP");
    }
  }, [row.consolRef, row.jobRef]);
  const [templateMenu, setTemplateMenu] = useState<{ x: number, y: number, visible: boolean } | null>(null);
  const [tmplIdToDelete, setTmplIdToDelete] = useState<string | null>(null);

  const [templates, setTemplates] = useState<{ id: string; name: string; text: string; port: string; ownerId?: string; ownerUsername?: string; isPrivate?: boolean }[]>([]);
  const [menuMode, setMenuMode] = useState<"select" | "manage" | "add" | "edit">("select");
  const [editTmplId, setEditTmplId] = useState<string | null>(null);
  const [tempName, setTempName] = useState("");
  const [tempText, setTempText] = useState("");
  const [tempPort, setTempPort] = useState("");
  const [tempIsPrivate, setTempIsPrivate] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [selectedListTab, setSelectedListTab] = useState<"PORT" | "ONLY_ME">("PORT");

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
      return;
    }

    const unsub = onSnapshot(collection(db, "cargo_templates"), (snapshot) => {
      const fetched: any[] = [];
      snapshot.forEach((snapshotDoc) => {
        fetched.push({ id: snapshotDoc.id, ...snapshotDoc.data() });
      });
      setTemplates(fetched);
      localStorage.setItem("SEAWAY_CARGO_TEMPLATES_V3", JSON.stringify(fetched));
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
    });

    return () => unsub();
  }, [offlineMode, currentUser]);

  const handleAddNewTemplate = async (name: string, text: string, pVal: string, isPrivate: boolean) => {
    const cleanedPort = (pVal || "").toUpperCase();
    const newId = `${cleanedPort.toLowerCase()}_${Date.now()}`;
    const newTmpl = {
      id: newId,
      name: name.trim(),
      text: text.trim().toUpperCase(),
      port: cleanedPort,
      ownerId: currentUser?.uid || "system",
      ownerUsername: currentUser?.displayName || currentUser?.email || "Operator",
      isPrivate: isPrivate,
      updatedAt: new Date().toISOString()
    };

    if (offlineMode) {
      const updated = [...templates, newTmpl];
      setTemplates(updated);
      localStorage.setItem("SEAWAY_CARGO_TEMPLATES_V3", JSON.stringify(updated));
    } else {
      try {
        await setDoc(doc(db, "cargo_templates", newId), newTmpl);
      } catch (err) {
        console.error("Error adding template to Firestore:", err);
      }
    }
  };

  const handleEditExistingTemplate = async (id: string, name: string, text: string, pVal: string, isPrivate: boolean) => {
    const cleanedPort = (pVal || "").toUpperCase();
    const updatedTmpl = {
      id,
      name: name.trim(),
      text: text.trim().toUpperCase(),
      port: cleanedPort,
      ownerId: currentUser?.uid || "system",
      ownerUsername: currentUser?.displayName || currentUser?.email || "Operator",
      isPrivate: isPrivate,
      updatedAt: new Date().toISOString()
    };

    if (offlineMode) {
      const updated = templates.map(t => t.id === id ? updatedTmpl : t);
      setTemplates(updated);
      localStorage.setItem("SEAWAY_CARGO_TEMPLATES_V3", JSON.stringify(updated));
    } else {
      try {
        await setDoc(doc(db, "cargo_templates", id), updatedTmpl);
      } catch (err) {
        console.error("Error updating template in Firestore:", err);
      }
    }
  };

  const handleDeleteExistingTemplate = async (id: string) => {
    if (offlineMode) {
      const updated = templates.filter(t => t.id !== id);
      setTemplates(updated);
      localStorage.setItem("SEAWAY_CARGO_TEMPLATES_V3", JSON.stringify(updated));
    } else {
      try {
        await deleteDoc(doc(db, "cargo_templates", id));
      } catch (err) {
        console.error("Error deleting template from Firestore:", err);
      }
    }
  };

  // CCS Control Sheet specific state
  interface CCSUnit {
    id: number;
    unitNo: string;
    qtyLoaded: string;
    total: string;
    tallies: string[];
  }

  const getInitialCcsUnits = (): CCSUnit[] => {
    return Array(6).fill(null).map((_, idx) => ({
      id: idx + 1,
      unitNo: "",
      qtyLoaded: "",
      total: "",
      tallies: ["", "", "", ""]
    }));
  };

  const [ccsUnits, setCcsUnits] = useState<CCSUnit[]>(() => {
    if (savedData?.ccsUnits) {
      return savedData.ccsUnits;
    }
    return getInitialCcsUnits();
  });

  const [ccsMeta, setCcsMeta] = useState(() => {
    if (savedData?.ccsMeta) {
      return savedData.ccsMeta;
    }
    return {
      operator: row.operator || "",
      mawb: row.awb || "",
      unitNo: "",
      flight: row.flight || "",
      cutoffDateTime: `${toDisplay(row.date) || ""} / ${row.cutoff || ""}`,
      shipper: row.shipper || "",
      destination: row.dest || "",
      quantityBooked: "", // Initialized blank to dynamically fall back to count from load sheet (CCS)
      actualQty: "",
      comments: "",
      checkedBy: "",
      teamResponsible: "", // Initialized blank as requested, fully free-typable
    };
  });

  // Load initial settings asynchronously from Firestore if available
  useEffect(() => {
    if (offlineMode) return;
    const fetchFromCloud = async () => {
      try {
        const activeUser = currentUser || auth.currentUser;
        if (!activeUser) return;
        const parentWorkspaceId = row.workspaceId || row.ownerId || activeUser.uid;
        const docRef = doc(db, "loadsheets", `${parentWorkspaceId}_${row.id}`);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const cloudData = snap.data();
          if (cloudData.ls) setLs(cloudData.ls);
          if (typeof cloudData.includeCarcases === "boolean") setIncludeCarcases(cloudData.includeCarcases);
          if (cloudData.ccsUnits) setCcsUnits(cloudData.ccsUnits);
          if (cloudData.ccsMeta) setCcsMeta(cloudData.ccsMeta);
        }
      } catch (err) {
        console.error("Failed to load loadsheet from Firestore cloud:", err);
      }
    };
    fetchFromCloud();
  }, [row.id, row.workspaceId, row.ownerId, currentUser, offlineMode]);

  // Automatically save to localStorage when states change, with debounced cloud save
  useEffect(() => {
    try {
      const dataToSave = {
        ls,
        includeCarcases,
        ccsUnits,
        ccsMeta,
        parentUld: row.uld || "",
      };
      localStorage.setItem(`loadsheet_autosave_v2_${row.id}`, JSON.stringify(dataToSave));
    } catch (e) {
      console.error("Autosave error:", e);
    }

    if (offlineMode) return;
    const activeUser = currentUser || auth.currentUser;
    if (!activeUser) return;
    const timer = setTimeout(async () => {
      try {
        const parentWorkspaceId = row.workspaceId || row.ownerId || activeUser.uid;
        const docRef = doc(db, "loadsheets", `${parentWorkspaceId}_${row.id}`);
        await setDoc(docRef, {
          shipmentId: Number(row.id),
          parentUld: row.uld || "",
          includeCarcases,
          ls,
          ccsMeta,
          ccsUnits,
          ownerId: row.ownerId || activeUser.uid,
          workspaceId: row.workspaceId || parentWorkspaceId,
          updatedBy: activeUser.uid,
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {
        console.error("Failed to save Loadsheet to cloud:", e);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [ls, includeCarcases, ccsUnits, ccsMeta, row.id, row.uld, row.workspaceId, row.ownerId, currentUser, offlineMode]);

  // Keep header fields in sync between Page 1 (ls) and Page 2 (ccsMeta)
  useEffect(() => {
    setCcsMeta(prev => {
      const updates = {} as Partial<typeof ccsMeta>;
      if (prev.operator !== ls.operator) updates.operator = ls.operator;
      if (prev.mawb !== ls.mawb) updates.mawb = ls.mawb;
      if (prev.flight !== ls.flight) updates.flight = ls.flight;
      if (prev.destination !== ls.destination) updates.destination = ls.destination;
      if (prev.shipper !== ls.shipper) updates.shipper = ls.shipper;
      
      if (Object.keys(updates).length > 0) {
        return { ...prev, ...updates };
      }
      return prev;
    });
  }, [ls.operator, ls.mawb, ls.flight, ls.destination, ls.shipper]);

  useEffect(() => {
    setLs(prev => {
      const updates = {} as Partial<typeof ls>;
      if (prev.operator !== ccsMeta.operator) updates.operator = ccsMeta.operator;
      if (prev.mawb !== ccsMeta.mawb) updates.mawb = ccsMeta.mawb;
      if (prev.flight !== ccsMeta.flight) updates.flight = ccsMeta.flight;
      if (prev.destination !== ccsMeta.destination) updates.destination = ccsMeta.destination;
      if (prev.shipper !== ccsMeta.shipper) updates.shipper = ccsMeta.shipper;
      
      if (Object.keys(updates).length > 0) {
        return { ...prev, ...updates };
      }
      return prev;
    });
  }, [ccsMeta.operator, ccsMeta.mawb, ccsMeta.flight, ccsMeta.destination, ccsMeta.shipper]);
  
  // Synchronize loadsheet with parent row changes (such as loadType, cutoff, date, flight, dest, shipper, and awb)
  useEffect(() => {
    const calculatedDay = row.date ? `${getDayOfWeek(row.date).toUpperCase()} - ${toDisplay(row.date)}` : "";
    const calculatedCutoffTime = row.cutoff || "";
    const calculatedCutoffDateTime = `${toDisplay(row.date) || ""} / ${row.cutoff || ""}`;

    setLs(prev => {
      const updates = {} as Partial<typeof ls>;
      if (row.operator && prev.operator !== row.operator) updates.operator = row.operator;
      if (row.awb && prev.mawb !== row.awb) updates.mawb = row.awb;
      if (calculatedDay && prev.cutoffDay !== calculatedDay) updates.cutoffDay = calculatedDay;
      if (prev.cutoffTime !== calculatedCutoffTime) updates.cutoffTime = calculatedCutoffTime;
      if (row.shipper && prev.shipper !== row.shipper) updates.shipper = row.shipper;
      if (row.flight && prev.flight !== row.flight) updates.flight = row.flight;
      if (row.dest && prev.destination !== row.dest) updates.destination = row.dest;
      if (row.commodity && prev.commodity !== row.commodity) updates.commodity = row.commodity;
      if (row.cto && prev.cto !== row.cto) updates.cto = row.cto;
      if (row.uld && prev.uld !== row.uld) updates.uld = row.uld;
      if (row.ice && prev.ice !== row.ice) updates.ice = row.ice;
      if (row.scr && prev.scr !== row.scr) updates.scr = row.scr;

      if (Object.keys(updates).length > 0) {
        return { ...prev, ...updates };
      }
      return prev;
    });

    setCcsMeta(prev => {
      const updates = {} as Partial<typeof ccsMeta>;
      if (row.operator && prev.operator !== row.operator) updates.operator = row.operator;
      if (row.awb && prev.mawb !== row.awb) updates.mawb = row.awb;
      if (row.flight && prev.flight !== row.flight) updates.flight = row.flight;
      if (prev.cutoffDateTime !== calculatedCutoffDateTime) updates.cutoffDateTime = calculatedCutoffDateTime;
      if (row.shipper && prev.shipper !== row.shipper) updates.shipper = row.shipper;
      if (row.dest && prev.destination !== row.dest) updates.destination = row.dest;

      if (Object.keys(updates).length > 0) {
        return { ...prev, ...updates };
      }
      return prev;
    });
  }, [
    row.operator,
    row.awb,
    row.date,
    row.cutoff,
    row.shipper,
    row.flight,
    row.dest,
    row.commodity,
    row.cto,
    row.uld,
    row.ice,
    row.scr
  ]);

  // Keep parent shipment's operator in sync with loadsheet operator in real-time
  useEffect(() => {
    if (onUpdateShipment && ls.operator && ls.operator !== row.operator) {
      onUpdateShipment(row.id, { operator: ls.operator });
    }
  }, [ls.operator, row.id, row.operator, onUpdateShipment]);

  // Track last seen row.uld to mirror any programmatic ULD change cleanly
  const lastSeenUldRef = useRef(row.uld || "");
  useEffect(() => {
    const targetUld = row.uld || "";
    if (targetUld !== lastSeenUldRef.current) {
      lastSeenUldRef.current = targetUld;
      setLs(prev => {
        const updates = {} as Partial<typeof ls>;
        if (prev.uld !== targetUld) {
          updates.uld = targetUld;
        }
        if (prev.unitsLine2 !== targetUld) {
          updates.unitsLine2 = targetUld;
        }
        if (Object.keys(updates).length > 0) {
          return { ...prev, ...updates };
        }
        return prev;
      });
    }
  }, [row.uld]);

  const handleResetDefaults = () => {
    localStorage.removeItem(`loadsheet_autosave_v2_${row.id}`);
    if (!offlineMode) {
      const activeUser = currentUser || auth.currentUser;
      if (activeUser) {
        const parentWorkspaceId = row.workspaceId || row.ownerId || activeUser.uid;
        deleteDoc(doc(db, "loadsheets", `${parentWorkspaceId}_${row.id}`)).catch((e) =>
          console.error("Failed to delete cloud loadsheet:", e)
        );
      }
    }
    setLs({
      operator: row.operator || "",
      mawb: row.awb || "",
      cutoffDay: row.date ? `${getDayOfWeek(row.date).toUpperCase()} - ${toDisplay(row.date)}` : "",
      cutoffTime: row.cutoff || "",
      shipper: row.shipper || "",
      flight: row.flight || "",
      destination: row.dest || "",
      dryIceYes: !!row.ice,
      dryIceNo: !row.ice,
      dryIceAmount: row.ice || "",
      sealsYes: false,
      sealsNo: true,
      inspectionAt: "",
      foilYes: false,
      foilNo: true,
      tempRecorderYes: false,
      tempRecorderNo: true,
      cargoRows: getInitialCargoRows(),
      unitsLine2: row.uld || "",
      customSpecialInstructions: "",
      loadIn: "",
      loadInTemp1: "",
      loadInTemp2: "",
      loadInTemp3: "",
      loadOut: "",
      loadOutTemp1: "",
      loadOutTemp2: "",
      loadOutTemp3: "",
      pickedBy: "", checkedBy: "", loadedBy: "",
      dateIn: "",
      dateOut: "",
      commodity: row.commodity || "",
      cto: row.cto || "",
      uld: row.uld || "",
      ice: row.ice || "",
      scr: row.scr || "",
    });
    setIncludeCarcases((row.commodity || "").toUpperCase().includes("CARCASE"));
    setCcsUnits(getInitialCcsUnits());
    setCcsMeta({
      operator: row.operator || "",
      mawb: row.awb || "",
      unitNo: "",
      flight: row.flight || "",
      cutoffDateTime: `${toDisplay(row.date) || ""} / ${row.cutoff || ""}`,
      shipper: row.shipper || "",
      destination: row.dest || "",
      quantityBooked: "",
      actualQty: "",
      comments: "",
      checkedBy: "",
      teamResponsible: "",
    });
    setShowResetConfirm(false);
  };

  const totalLoadOutCount = ls.cargoRows
    .map((cr) => parseInt(cr.count, 10))
    .filter((v) => !isNaN(v))
    .reduce((sum, v) => sum + v, 0);

  const totalLoadOutWeight = ls.cargoRows
    .map((cr) => parseFloat(cr.weight))
    .filter((v) => !isNaN(v))
    .reduce((sum, v) => sum + v, 0);

  const totalLoadOutSkd = ls.cargoRows
    .map((cr) => parseInt(cr.skd, 10))
    .filter((v) => !isNaN(v))
    .reduce((sum, v) => sum + v, 0);

  const updateCcsUnit = (id: number, field: keyof Omit<CCSUnit, 'id' | 'tallies'>, value: string) => {
    setCcsUnits(prev => prev.map(u => u.id === id ? { ...u, [field]: value } : u));
  };

  const updateCcsTally = (unitId: number, tallyIndex: number, value: string) => {
    setCcsUnits(prev => prev.map(u => {
      if (u.id === unitId) {
        const nextTallies = [...u.tallies];
        nextTallies[tallyIndex] = value;
        const validTallies = nextTallies.map(t => parseFloat(t)).filter(v => !isNaN(v));
        const autoTotal = validTallies.length > 0 ? String(validTallies.reduce((a, b) => a + b, 0)) : "";
        return { ...u, tallies: nextTallies, total: autoTotal };
      }
      return u;
    }));
  };

  const sl = (k: keyof typeof ls) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    let val = e.target.value.toUpperCase();
    if (k === "mawb") {
      val = formatAwb(val, ls.mawb);
    }
    setLs((s) => {
      const updates: Partial<typeof ls> = { [k]: val };
      if (k === "uld") {
        updates.unitsLine2 = val;
      }
      return { ...s, ...updates };
    });
  };

  const setCargo = (i: number, k: keyof CargoRow, v: string | boolean) => {
    setLs((s) => {
      const rows = [...s.cargoRows];
      const finalVal = typeof v === "string" ? v.toUpperCase() : v;
      rows[i] = { ...rows[i], [k]: finalVal } as CargoRow;
      return { ...s, cargoRows: rows };
    });
  };

  const getAutoSpecialInstructions = () => {
    const parts: string[] = [];
    if (ls.dryIceYes) {
      parts.push(`DRY ICE / GEL PACKS: YES${ls.dryIceAmount ? ` (AMOUNT: ${ls.dryIceAmount})` : ""}`);
    } else if (ls.dryIceNo) {
      parts.push("DRY ICE / GEL PACKS: NO");
    }
    
    if (ls.foilYes) {
      parts.push("FOIL REQUIRED: YES");
    } else if (ls.foilNo) {
      parts.push("FOIL REQUIRED: NO");
    }

    if (ls.tempRecorderYes) {
      parts.push("TEMP RECORDER: YES");
    } else if (ls.tempRecorderNo) {
      parts.push("TEMP RECORDER: NO");
    }

    if (ls.sealsYes) {
      parts.push(`SEALS: YES${ls.inspectionAt ? ` (INSPECTION REQUIRED @ ${ls.inspectionAt})` : ""}`);
    } else if (ls.sealsNo) {
      parts.push("SEALS: NO");
    }

    // Add load in temps
    const liTemps = [ls.loadInTemp1, ls.loadInTemp2, ls.loadInTemp3].filter(v => v.trim() !== "");
    if (liTemps.length > 0) {
      parts.push(`LOAD IN TEMPS: ${liTemps.map(t => t.endsWith("°C") || t.endsWith("C") ? t : t + "°C").join(" / ")}`);
    }

    // Add load out temps
    const loTemps = [ls.loadOutTemp1, ls.loadOutTemp2, ls.loadOutTemp3].filter(v => v.trim() !== "");
    if (loTemps.length > 0) {
      parts.push(`LOAD OUT TEMPS: ${loTemps.map(t => t.endsWith("°C") || t.endsWith("C") ? t : t + "°C").join(" / ")}`);
    }

    return parts.join(" | ");
  };

  const getSopFontSize = (text: string) => {
    if (!text) return "14px";
    
    // We want the text to perfectly fit the expanded fixed textarea height of 190px.
    // Allow the font-size to dynamically scale from a maximum of 18px down to 6.5px.
    const availableHeight = 172; // 190px container height minus exact padding/borders
    const containerWidth = 310;  // approximate width of the split column in px
    const lines = text.split("\n");
    
    for (let fs = 18; fs >= 6.5; fs -= 0.5) {
      // Bold characters occupy approximately 53% of the font size on average in width.
      const charWidth = fs * 0.53;
      const maxCharsPerLine = Math.floor(containerWidth / charWidth) || 1;
      
      let totalVisualLines = 0;
      for (const line of lines) {
        if (line.length === 0) {
          totalVisualLines += 1;
        } else {
          totalVisualLines += Math.max(1, Math.ceil(line.length / maxCharsPerLine));
        }
      }
      
      const neededHeight = totalVisualLines * (fs * 1.25); // line-height is 1.25
      if (neededHeight <= availableHeight) {
        return `${fs}px`;
      }
    }
    
    return "6.5px"; // minimum readable size for ultra-long instruction blocks
  };

  const getUnitsFontSize = (text: string) => {
    if (!text) return "16px";
    
    // We want the text to perfectly fit the expanded fixed textarea height of 150px.
    // Allow the font-size to dynamically scale from a maximum of 18px down to 8px.
    const availableHeight = 132; // 150px container height minus exact padding/borders
    const containerWidth = 310;  // approximate width of the split column in px
    const lines = text.split("\n");
    
    for (let fs = 18; fs >= 8; fs -= 0.5) {
      // Bold characters occupy approximately 53% of the font size on average in width.
      const charWidth = fs * 0.53;
      const maxCharsPerLine = Math.floor(containerWidth / charWidth) || 1;
      
      let totalVisualLines = 0;
      for (const line of lines) {
        if (line.length === 0) {
          totalVisualLines += 1;
        } else {
          totalVisualLines += Math.max(1, Math.ceil(line.length / maxCharsPerLine));
        }
      }
      
      const neededHeight = totalVisualLines * (fs * 1.25); // line-height is 1.25
      if (neededHeight <= availableHeight) {
        return `${fs}px`;
      }
    }
    
    return "8px"; // minimum readable size for lots of unit numbers
  };

  const handlePrint = () => {
    if (!ls.operator.trim()) {
      alert("⚠️ Please enter the Operator name before printing.");
      return;
    }

    runPrintWindow();
  };

  const loadHtml2Pdf = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      if ((window as any).html2pdf) {
        resolve((window as any).html2pdf);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
      script.onload = () => resolve((window as any).html2pdf);
      script.onerror = (err) => reject(err);
      document.head.appendChild(script);
    });
  };

  const getLoadsheetHtml = () => {
    if (!printRef.current) return "";

    // Dynamically transfer all user input states to raw HTML attributes
    // by cloning the container to preserve live browser UI.
    const container = printRef.current;
    const containerClone = container.cloneNode(true) as HTMLDivElement;

    const originalInputs = container.querySelectorAll("input, textarea");
    const clonedInputs = containerClone.querySelectorAll("input, textarea");

    clonedInputs.forEach((clonedInput, index) => {
      const origEl = originalInputs[index] as HTMLInputElement | HTMLTextAreaElement;
      const el = clonedInput as HTMLInputElement | HTMLTextAreaElement;

      if (el.type === "checkbox") {
        const cb = origEl as HTMLInputElement;
        if (cb.checked) {
          el.setAttribute("checked", "checked");
        } else {
          el.removeAttribute("checked");
        }
      } else {
        el.setAttribute("value", origEl.value || "");
      }

      if (el.tagName === "TEXTAREA") {
        // Replace textarea with a div for perfect print wrapping and height expansion
        const div = document.createElement("div");
        div.className = el.className;
        div.textContent = origEl.value || "—";
        
        // Copy relevant styles for styling preservation
        const origStyle = window.getComputedStyle(origEl);
        div.setAttribute("style", `
          white-space: pre-wrap;
          word-break: break-word;
          font-family: inherit;
          font-weight: bold;
          font-size: ${origStyle.fontSize || "11px"};
          line-height: ${origStyle.lineHeight || "1.25"};
          border: 2px solid #000000;
          padding: 6px 8px;
          min-height: 85px;
          height: auto;
          box-sizing: border-box;
          background: #ffffff;
          margin-bottom: 4px;
        `);
        el.parentNode?.replaceChild(div, el);
      }
    });

    // Completely remove print-hidden elements to avoid page overflow
    containerClone.querySelectorAll(".print-hidden").forEach((el) => el.remove());

    const content = containerClone.innerHTML;
    return `<!DOCTYPE html><html><head><title>${ls.mawb || row.awb || "AWB"} and loadsheet</title>
    <style>
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      body {
        font-family: Arial, sans-serif;
        font-size: 11px;
        color: #000000 !important;
        background: #ffffff !important;
        padding: 10px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        border: 2px solid #000000 !important;
      }
      td {
        border: 2px solid #000000 !important;
        padding: 3px 5px;
        vertical-align: middle !important;
        color: #000000 !important;
      }
      th {
        border: 2px solid #000000 !important;
        padding: 6px 6px !important;
        vertical-align: middle;
        background: #000000 !important;
        color: #ffffff !important;
        -webkit-text-fill-color: #ffffff !important;
        font-size: 15px !important;
        font-weight: 900 !important;
        text-transform: uppercase;
      }
      .hdr {
        font-size: 16px;
        font-weight: bold;
        text-align: center;
        border: 2px solid #000000 !important;
        padding: 5px;
        margin-bottom: 4px;
        letter-spacing: 2px;
        color: #000000 !important;
        background: #ffffff !important;
      }
      .sub {
        text-align: center;
        font-size: 9px;
        color: #000000 !important;
        margin-bottom: 6px;
        font-weight: bold;
      }
      .sec {
        background: #000000 !important;
        color: #ffffff !important;
        font-weight: bold;
        font-size: 9px;
        padding: 3px 6px;
        text-transform: uppercase;
        letter-spacing: .1em;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .lbl {
        font-size: 8px;
        color: #000000 !important;
        font-weight: bold;
        display: block;
        text-transform: uppercase;
        margin-bottom: 1px;
      }
      .val {
        font-size: 11px;
        font-weight: bold;
        color: #000000 !important;
      }
      .freetext {
        font-size: 11px;
        color: #000000 !important;
      }
      input {
        border: none !important;
        width: 100%;
        outline: none !important;
        background: transparent !important;
        font-size: 11px;
        font-weight: bold;
        color: #000000 !important;
        -webkit-text-fill-color: #000000 !important;
      }
      textarea {
        border: none !important;
        width: 100%;
        outline: none !important;
        background: transparent !important;
        font-size: 11px;
        font-weight: bold;
        color: #000000 !important;
        -webkit-text-fill-color: #000000 !important;
      }
      textarea.with-border {
        border: 2px solid #000000 !important;
        padding: 6px 8px !important;
        box-sizing: border-box !important;
        background: #ffffff !important;
        margin-bottom: 4px !important;
        display: block !important;
      }
      input::placeholder, textarea::placeholder {
        color: transparent !important;
        -webkit-text-fill-color: transparent !important;
        opacity: 0 !important;
      }
      
      /* Enforce precise design of printed checkboxes so they print flawlessly regardless of browser setup */
      input[type="checkbox"] {
        -webkit-appearance: none !important;
        appearance: none !important;
        width: 14px !important;
        height: 14px !important;
        border: 2px solid #000000 !important;
        background-color: #ffffff !important;
        display: block !important;
        margin: 0 auto !important;
        position: relative !important;
        border-radius: 2px !important;
        cursor: default;
      }
      input[type="checkbox"]:checked::after {
        content: "✔" !important;
        position: absolute !important;
        top: 50% !important;
        left: 50% !important;
        transform: translate(-50%, -50%) !important;
        font-size: 11px !important;
        line-height: 1 !important;
        color: #000000 !important;
        font-weight: bold !important;
      }

      @media print {
        html, body {
          height: auto !important;
          overflow: visible !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
        }
        body {
          padding: 0 !important;
          margin: 0 !important;
        } 
        @page {
          size: portrait;
          margin: 1.2cm !important;
        }
        #loadsheet-print-container {
          padding: 0 !important;
          margin: 0 !important;
          width: 100% !important;
          max-width: 100% !important;
          height: auto !important;
          background: #ffffff !important;
          transform: none !important;
        }
        .print-page {
          box-sizing: border-box !important;
          width: 100% !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
        #loadsheet-page-1 {
          height: auto !important;
          overflow: visible !important;
        }
        #loadsheet-page-2 {
          page-break-before: always !important;
          break-before: page !important;
          height: auto !important;
          overflow: visible !important;
          border-top: none !important;
          padding-top: 0 !important;
          margin-top: 0 !important;
        }
        .print-page-inner {
          transform: none !important;
          margin: 0 auto !important;
          height: auto !important;
          width: 100% !important;
          overflow: visible !important;
        }
        #loadsheet-page-1 .print-page-inner {
          transform: none !important;
          max-height: none !important;
        }
        #loadsheet-page-2 .print-page-inner {
          transform: none !important;
          max-height: none !important;
        }
        .print-page-inner > div {
          margin-bottom: 2px !important;
        }
        .print-page-inner textarea {
          height: auto !important;
        }
        .print-page-inner td {
          padding: 2px 4px !important;
        }
        .print-page-inner td input:not([type="checkbox"]) {
          padding: 2px 4px !important;
          font-size: 11px !important;
          height: auto !important;
        }
        .print-page-inner th {
          padding: 2px 4px !important;
          font-size: 11px !important;
        }
        
        /* Cargo table special print override to make it 1.5x larger and high contrast */
        .cargo-table th {
          padding: 6px 6px !important;
          font-size: 13px !important;
        }
        .cargo-table td {
          padding: 0 !important;
        }
        .cargo-table td input:not([type="checkbox"]) {
          padding: 4px 6px !important;
          font-size: 14px !important;
          height: auto !important;
        }
        .cargo-table input[type="checkbox"] {
          width: 20px !important;
          height: 20px !important;
        }
        .cargo-table input[type="checkbox"]:checked::after {
          font-size: 15px !important;
        }

        .print-page-inner [style*="min-height: 44px"],
        .print-page-inner [style*="min-height:44px"],
        .print-page-inner [style*="minHeight: 44px"],
        .print-page-inner [style*="minHeight:44px"],
        .print-page-inner [style*="minHeight: 44"],
        .print-page-inner [style*="minHeight:44"] {
          min-height: 30px !important;
        }
        .print-page-inner [style*="min-height: 36px"],
        .print-page-inner [style*="min-height:36px"],
        .print-page-inner [style*="minHeight: 36px"],
        .print-page-inner [style*="minHeight:36px"],
        .print-page-inner [style*="minHeight: 36"],
        .print-page-inner [style*="minHeight:36"] {
          min-height: 24px !important;
        }

        .print-hidden, 
        .print-hidden *,
        [class*="print-hidden"] {
          display: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
          height: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
        }
      }
    </style></head><body>${content}</body></html>`;
  };

  const runPrintWindow = () => {
    const htmlContent = getLoadsheetHtml();
    if (!htmlContent) return;
    const win = window.open("", "_blank", "width=950,height=800");
    if (!win) return;
    win.document.write(htmlContent);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 500);
  };

  const fld = { border: "none", borderBottom: "2px solid #000000", outline: "none", width: "100%", fontSize: "12px", fontFamily: "inherit", background: "transparent", padding: "1px 2px", color: "#000000", fontWeight: "bold" };
  const cellSt = (minH = 32) => ({ border: "2px solid #000000", padding: "3px 6px", minHeight: minH, background: "#ffffff", display: "flex", flexDirection: "column" as const, justifyContent: "space-between" });
  const lblSt = { fontSize: 9, color: "#000000", textTransform: "uppercase" as const, letterSpacing: ".05em", display: "block", marginBottom: 1, fontWeight: "bold" as const };
  const secSt = { background: "#000000", color: "#ffffff", fontWeight: 700, fontSize: 10, padding: "4px 10px", textTransform: "uppercase" as const, letterSpacing: ".1em" };

  const calculatedSubject = emailType === "CON"
    ? `[ediDocManager CON MSC ${emailConsolRef.trim().toUpperCase() || "C0000XXXX"}]`
    : `[ediDocManager SHP MSC ${emailJobRef.trim().toUpperCase() || "S0000XXXX"}]`;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(29,29,31,0.4)", backdropFilter: "blur(4px)", zIndex: 999, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "20px" }}>
      
      {/* Emailing Method Process Modal */}
      {showEmailModal && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.6)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          backdropFilter: "blur(2px)"
        }}>
          <div style={{
            background: "#ffffff",
            borderRadius: 16,
            padding: 28,
            maxWidth: 700,
            width: "100%",
            boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
            border: "1px solid #e5e7eb",
            textAlign: "left",
            fontFamily: "inherit"
          }}>
            <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#1e3a8a", margin: "0 0 8px 0" }}>
              Emailing Method Process
            </h2>
            <p style={{ fontSize: "14px", color: "#2563eb", fontWeight: "500", margin: "0 0 20px 0", lineHeight: "1.5" }}>
              The subject line must be in the correct format in order for it to attach to the eDocs tab of the job.
            </p>

            {/* Email process specifications */}
            <div style={{ background: "#f8fafc", borderLeft: "4px solid #3b82f6", padding: "16px", borderRadius: "8px", marginBottom: "20px" }}>
              <ul style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "8px", fontSize: "13.5px", color: "#334155" }}>
                <li>Email to be sent to <strong style={{ color: "#2563eb" }}>edisapmel@seaway.com.au</strong></li>
                <li>Email subject to be as follows: <strong style={{ color: "#0f172a", fontFamily: "monospace", background: "#e2e8f0", padding: "2px 6px", borderRadius: "4px" }}>[ediDocManager {emailType} MSC {emailType === "CON" ? (emailConsolRef.toUpperCase() || "C0000XXXX") : (emailJobRef.toUpperCase() || "S0000XXXX")}]</strong></li>
                <li>Where the module code <strong style={{ color: "#0f172a" }}>{emailType}</strong> is used, this represents the module we want to eDoc to.</li>
                <li><strong style={{ color: "#0f172a" }}>MSC</strong> is the doc type we wish to eDoc (Loadsheet).</li>
                <li><strong style={{ color: "#0f172a" }}>{emailType === "CON" ? (emailConsolRef.toUpperCase() || "C0000XXXX") : (emailJobRef.toUpperCase() || "S0000XXXX")}</strong> is of course the Shipment / Consolidation Number (Job Reference).</li>
              </ul>
              
              <div style={{ marginTop: "16px", borderTop: "1px dashed #cbd5e1", paddingTop: "12px" }}>
                <span style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
                  Examples that could be used to allocate a Loadsheet document automatically include:
                </span>
                <ul style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "4px", fontSize: "12.5px", color: "#475569" }}>
                  <li>For Consolidations: <code style={{ fontWeight: "700", color: "#1e3a8a" }}>[ediDocManager CON MSC C0000XXXX]</code></li>
                  <li>For Shipments: <code style={{ fontWeight: "700", color: "#1e3a8a" }}>[ediDocManager SHP MSC S0000XXXX]</code></li>
                </ul>
              </div>
            </div>

            {/* Form Inputs for Reference Numbers */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "6px" }}>Consol Number (CON):</label>
                <input
                  type="text"
                  placeholder="e.g. C0000XXXX"
                  value={emailConsolRef}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    setEmailConsolRef(val);
                    if (val.trim()) {
                      setEmailType("CON");
                    }
                    if (onUpdateShipment) {
                      onUpdateShipment(row.id, { consolRef: val });
                    }
                  }}
                  style={{ width: "100%", padding: "10px 12px", fontSize: "13.5px", border: "1px solid #cbd5e1", borderRadius: "8px", outline: "none", boxSizing: "border-box", fontWeight: "bold" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "6px" }}>Job Number (SHP):</label>
                <input
                  type="text"
                  placeholder="e.g. S0000XXXX"
                  value={emailJobRef}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    setEmailJobRef(val);
                    if (val.trim() && !emailConsolRef.trim()) {
                      setEmailType("SHP");
                    }
                    if (onUpdateShipment) {
                      onUpdateShipment(row.id, { jobRef: val });
                    }
                  }}
                  style={{ width: "100%", padding: "10px 12px", fontSize: "13.5px", border: "1px solid #cbd5e1", borderRadius: "8px", outline: "none", boxSizing: "border-box", fontWeight: "bold" }}
                />
              </div>
            </div>

            {/* Toggle Target Type */}
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "6px" }}>Module Code Destination:</label>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => setEmailType("CON")}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid " + (emailType === "CON" ? "#2563eb" : "#cbd5e1"),
                    background: emailType === "CON" ? "#eff6ff" : "#ffffff",
                    color: emailType === "CON" ? "#2563eb" : "#475569",
                    fontWeight: "700",
                    fontSize: "13px",
                    cursor: "pointer"
                  }}
                >
                  CON (Consolidation - {emailConsolRef || "None entered"})
                </button>
                <button
                  onClick={() => setEmailType("SHP")}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid " + (emailType === "SHP" ? "#2563eb" : "#cbd5e1"),
                    background: emailType === "SHP" ? "#eff6ff" : "#ffffff",
                    color: emailType === "SHP" ? "#2563eb" : "#475569",
                    fontWeight: "700",
                    fontSize: "13px",
                    cursor: "pointer"
                  }}
                >
                  SHP (Shipment - {emailJobRef || "None entered"})
                </button>
              </div>
            </div>

            {/* Choose Recipient Email */}
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "6px" }}>Recipient Email Address:</label>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14px", color: "#1e293b", cursor: "pointer", background: emailTarget === "cargowise" ? "#f8fafc" : "transparent", padding: "8px 12px", borderRadius: "8px", border: "1px solid " + (emailTarget === "cargowise" ? "#cbd5e1" : "transparent") }}>
                  <input
                    type="radio"
                    name="emailTarget"
                    checked={emailTarget === "cargowise"}
                    onChange={() => setEmailTarget("cargowise")}
                  />
                  <span>Send to Cargowise: <strong style={{ color: "#2563eb" }}>edisapmel@seaway.com.au</strong></span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14px", color: "#1e293b", cursor: "pointer", background: emailTarget === "user" ? "#f8fafc" : "transparent", padding: "8px 12px", borderRadius: "8px", border: "1px solid " + (emailTarget === "user" ? "#cbd5e1" : "transparent") }}>
                  <input
                    type="radio"
                    name="emailTarget"
                    checked={emailTarget === "user"}
                    onChange={() => setEmailTarget("user")}
                  />
                  <span>Send to your login email: <strong style={{ color: "#2563eb" }}>{currentUser?.email || "dispatcher@seaway.com.au"}</strong></span>
                </label>
              </div>
            </div>

            {/* Generated Subject Line Display */}
            <div style={{ background: "#f1f5f9", padding: "12px 16px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "20px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
                Generated Email Subject:
              </span>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                <span style={{ fontFamily: "monospace", fontSize: "14px", fontWeight: "700", color: "#0f172a", wordBreak: "break-all" }}>
                  {calculatedSubject}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(calculatedSubject);
                    alert("✓ Subject line copied to clipboard!");
                  }}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#475569",
                    cursor: "pointer",
                    whiteSpace: "nowrap"
                  }}
                >
                  📋 Copy Subject
                </button>
              </div>
            </div>

            {/* Info tip about saving AWB# and loadsheet */}
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: "12px", borderRadius: "8px", marginBottom: "24px", color: "#1e3a8a", fontSize: "13px", lineHeight: "1.4" }}>
              💡 <strong>Automatic PDF Attachment:</strong> Clicking <strong>"Open Email Client"</strong> below will instantly generate and download the actual loadsheet as a professional PDF document titled <strong>"{ls.mawb || row.awb || "AWB"} and loadsheet.pdf"</strong> while opening your email composer. You can instantly drag and drop or attach this downloaded PDF to your email!
              {includeCarcases ? (
                <div style={{ marginTop: "6px", fontWeight: "bold", color: "#2563eb" }}>
                  🥩 Both Page 1 (Loadsheet) and Page 2 (Carcase Control Sheet) will be included in the PDF.
                </div>
              ) : (
                <div style={{ marginTop: "6px", fontWeight: "bold", color: "#2563eb" }}>
                  📄 Only Page 1 (Loadsheet) will be included in the PDF, as the Carcase Sheet is not selected.
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                disabled={isGeneratingPdf}
                onClick={() => setShowEmailModal(false)}
                style={{
                  flex: 1,
                  background: "#f3f4f6",
                  color: "#374151",
                  border: "1px solid #d1d5db",
                  borderRadius: 10,
                  padding: "12px 16px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: isGeneratingPdf ? "not-allowed" : "pointer",
                  transition: "background 0.2s",
                  opacity: isGeneratingPdf ? 0.6 : 1
                }}
              >
                Close
              </button>
              <button
                disabled={isGeneratingPdf}
                onClick={async () => {
                  if (isGeneratingPdf) return;
                  setIsGeneratingPdf(true);
                  try {
                    const container = printRef.current;
                    if (!container) {
                      throw new Error("No print container found.");
                    }

                    // Load html2pdf from CDN dynamically
                    const html2pdf = await loadHtml2Pdf();

                    // Clone container to set input values and textareas
                    const containerClone = container.cloneNode(true) as HTMLDivElement;
                    const originalInputs = container.querySelectorAll("input, textarea");
                    const clonedInputs = containerClone.querySelectorAll("input, textarea");

                    clonedInputs.forEach((clonedInput, index) => {
                      const origEl = originalInputs[index] as HTMLInputElement | HTMLTextAreaElement;
                      const el = clonedInput as HTMLInputElement | HTMLTextAreaElement;

                      if (el.type === "checkbox") {
                        const cb = origEl as HTMLInputElement;
                        if (cb.checked) {
                          el.setAttribute("checked", "checked");
                        } else {
                          el.removeAttribute("checked");
                        }
                      } else {
                        el.setAttribute("value", origEl.value || "");
                      }

                      if (el.tagName === "TEXTAREA") {
                        const div = document.createElement("div");
                        div.className = el.className;
                        div.textContent = origEl.value || "—";
                        const origStyle = window.getComputedStyle(origEl);
                        div.setAttribute("style", `
                          white-space: pre-wrap;
                          word-break: break-word;
                          font-family: Arial, sans-serif;
                          font-weight: bold;
                          font-size: ${origStyle.fontSize || "11px"};
                          line-height: ${origStyle.lineHeight || "1.25"};
                          border: 2px solid #000000;
                          padding: 6px 8px;
                          min-height: 85px;
                          height: auto;
                          box-sizing: border-box;
                          background: #ffffff;
                          margin-bottom: 4px;
                        `);
                        el.parentNode?.replaceChild(div, el);
                      }
                    });

                    // Completely remove print-hidden elements to avoid page overflow in PDF
                    containerClone.querySelectorAll(".print-hidden").forEach((el) => el.remove());

                    // Create high-fidelity styles wrapper for the PDF engine
                    const wrapper = document.createElement("div");
                    wrapper.style.padding = "10px";
                    wrapper.style.background = "#ffffff";
                    wrapper.style.fontFamily = "Arial, sans-serif";
                    wrapper.style.fontSize = "11px";
                    wrapper.style.color = "#000000";

                    const styleEl = document.createElement("style");
                    styleEl.textContent = `
                      * {
                        box-sizing: border-box;
                        margin: 0;
                        padding: 0;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                      }
                      #loadsheet-print-container {
                        padding: 4px !important;
                      }
                      #loadsheet-page-1 {
                        font-size: 10px !important;
                        line-height: 1.25 !important;
                      }
                      .print-page-inner > div {
                        margin-bottom: 2px !important;
                      }
                      table {
                        width: 100%;
                        border-collapse: collapse;
                        border: 2px solid #000000 !important;
                      }
                      td {
                        border: 2px solid #000000 !important;
                        padding: 2px 4px !important;
                        vertical-align: middle !important;
                        color: #000000 !important;
                      }
                      th {
                        border: 2px solid #000000 !important;
                        padding: 4px 4px !important;
                        vertical-align: middle;
                        background: #000000 !important;
                        color: #ffffff !important;
                        -webkit-text-fill-color: #ffffff !important;
                        font-size: 12px !important;
                        font-weight: 900 !important;
                        text-transform: uppercase;
                      }
                      .cargo-table th {
                        padding: 4px 4px !important;
                        font-size: 11px !important;
                      }
                      .cargo-table td {
                        padding: 0 !important;
                      }
                      .cargo-table td input {
                        padding: 4px 6px !important;
                        font-size: 11px !important;
                        font-weight: bold !important;
                      }
                      .cargo-table tr {
                        line-height: 1.1 !important;
                      }
                      /* Compress signature boxes height */
                      .print-page-inner div[style*="min-height: 76"] {
                        min-height: 48px !important;
                        height: 48px !important;
                      }
                      .print-page-inner div[style*="min-height: 76"] input {
                        font-size: 10px !important;
                        padding: 1px !important;
                      }
                      /* Compress temperature boxes height */
                      .print-page-inner div[style*="min-height: 45"] {
                        min-height: 35px !important;
                        height: 35px !important;
                      }
                      .print-page-inner div[style*="min-height: 45"] input {
                        font-size: 12px !important;
                      }
                      /* Compress textareas / free-type boxes height */
                      #loadsheet-page-1 textarea,
                      #loadsheet-page-1 div[style*="min-height: 85"],
                      #loadsheet-page-1 .with-border {
                        height: 90px !important;
                        min-height: 90px !important;
                        font-size: 10px !important;
                        padding: 4px 6px !important;
                      }
                      .hdr {
                        font-size: 14px !important;
                        font-weight: bold;
                        text-align: center;
                        border: 2px solid #000000 !important;
                        padding: 3px !important;
                        margin-bottom: 2px !important;
                        letter-spacing: 2px;
                        color: #000000 !important;
                        background: #ffffff !important;
                      }
                      .sub {
                        text-align: center;
                        font-size: 8px !important;
                        color: #000000 !important;
                        margin-bottom: 4px !important;
                        font-weight: bold;
                      }
                      .sec {
                        background: #000000 !important;
                        color: #ffffff !important;
                        font-weight: bold;
                        font-size: 8px !important;
                        padding: 2px 4px !important;
                        text-transform: uppercase;
                        letter-spacing: .1em;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                      }
                      .lbl {
                        font-size: 8px;
                        color: #000000 !important;
                        font-weight: bold;
                        display: block;
                        text-transform: uppercase;
                        margin-bottom: 1px;
                      }
                      .val {
                        font-size: 10px !important;
                        font-weight: bold;
                        color: #000000 !important;
                      }
                      .freetext {
                        font-size: 10px !important;
                        color: #000000 !important;
                      }
                      input {
                        border: none !important;
                        width: 100%;
                        outline: none !important;
                        background: transparent !important;
                        color: #000000 !important;
                        font-family: inherit !important;
                        font-weight: bold !important;
                        font-size: 11px !important;
                      }
                      .print-hidden {
                        display: none !important;
                      }
                      .page-break {
                        page-break-before: always !important;
                        break-before: page !important;
                      }
                    `;
                    wrapper.appendChild(styleEl);
                    wrapper.appendChild(containerClone);

                    const opt = {
                      margin: [0.15, 0.15, 0.15, 0.15],
                      filename: `${ls.mawb || row.awb || "AWB"} and loadsheet.pdf`,
                      image: { type: 'jpeg', quality: 0.98 },
                      html2canvas: { 
                        scale: 2, 
                        useCORS: true, 
                        logging: false 
                      },
                      jsPDF: { 
                        unit: 'in', 
                        format: 'a4', 
                        orientation: 'portrait' 
                      },
                      pagebreak: { mode: ['css', 'legacy'] }
                    };

                    await html2pdf().set(opt).from(wrapper).save();
                  } catch (error) {
                    console.error("PDF generation failed:", error);
                    alert("⚠️ Local PDF compilation failed. Opening email client anyway!");
                  } finally {
                    setIsGeneratingPdf(false);
                  }

                  const targetAddress = emailTarget === "cargowise" ? "edisapmel@seaway.com.au" : (currentUser?.email || "dispatcher@seaway.com.au");
                  const mailtoUrl = `mailto:${targetAddress}?subject=${encodeURIComponent(calculatedSubject)}&body=${encodeURIComponent(`Hi Team,\n\nPlease find attached the Loadsheet for AWB ${ls.mawb || row.awb || "AWB"}.\n\nReference: ${emailType === "CON" ? (emailConsolRef || "N/A") : (emailJobRef || "N/A")}\n\nKind regards,\n${currentUser?.displayName || "Dispatcher"}`)}`;
                  window.location.href = mailtoUrl;
                }}
                style={{
                  flex: 1,
                  background: isGeneratingPdf ? "#86868b" : "#0284c7",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 10,
                  padding: "12px 16px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: isGeneratingPdf ? "not-allowed" : "pointer",
                  transition: "background 0.2s"
                }}
              >
                {isGeneratingPdf ? "⏳ Generating PDF..." : "Open Email Client 📧"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom absolute confirmation modal overlay safe for sandbox iframes */}
      {showResetConfirm && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.6)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          backdropFilter: "blur(2px)"
        }}>
          <div style={{
            background: "#ffffff",
            borderRadius: 16,
            padding: 24,
            maxWidth: 420,
            width: "100%",
            boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            border: "1px solid #e5e7eb",
            textAlign: "center"
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔄</div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: "#111827", marginBottom: 8, fontFamily: "inherit" }}>
              Reset Load Out Sheet?
            </h3>
            <p style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.5, marginBottom: 20, fontFamily: "inherit" }}>
              Are you sure you want to reset this load out sheet to its defaults?
              <br /><br />
              This will <strong>completely erase</strong> all manual entries (GRN, SKD, Count, Description, Weights, Temperatures, Tolls, and Tallies) and restore original flight details.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                onClick={() => setShowResetConfirm(false)}
                style={{
                  flex: 1,
                  background: "#f3f4f6",
                  color: "#374151",
                  border: "1px solid #d1d5db",
                  borderRadius: 10,
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background 0.2s"
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleResetDefaults}
                style={{
                  flex: 1,
                  background: "#dc2626",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 10,
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background 0.2s"
                }}
              >
                Yes, Reset Data
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ background: "#ffffff", borderRadius: 20, width: 1000, maxWidth: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", overflow: "hidden", border: "1px solid #e5e7eb" }}>

        {/* Modal toolbar - Apple style */}
        <div style={{ background: "#f5f5f7", padding: "14px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
          <span style={{ color: T.accent, fontWeight: 700, fontSize: 14 }}>📋 LOADSHEET — {ls.shipper || row.shipper}</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              id="load-sheet-carcases-toggle"
              onClick={() => setIncludeCarcases(!includeCarcases)}
              style={{
                background: includeCarcases ? "#f97316" : "#f3f4f6",
                border: "1px solid " + (includeCarcases ? "#ea580c" : "#d1d5db"),
                color: includeCarcases ? "#ffffff" : "#374151",
                borderRadius: 20,
                padding: "6px 14px",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 4,
                transition: "all 0.2s"
              }}
            >
              {includeCarcases ? "🥩 Carcase Attachment: Active" : "➕ Add CARCASE Control Sheet"}
            </button>
            {!ls.operator.trim() && <span style={{ color: T.red, fontSize: 11, fontWeight: 600 }}>⚠ ENTER OPERATOR TO PRINT</span>}
            <span className="print-hidden" style={{ fontSize: 11, color: "#16a34a", fontWeight: "700", display: "flex", alignItems: "center", gap: 4, marginRight: 8 }}>
              🟢 AUTOSAVED
            </span>
            <button
              id="load-sheet-reset-btn"
              onClick={() => setShowResetConfirm(true)}
              style={{
                background: "#fff5f5",
                border: "1px solid #fee2e2",
                color: "#dc2626",
                borderRadius: 20,
                padding: "8px 16px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                transition: "all 0.2s"
              }}
              title="Reset all sheet entries back to original shipment values"
            >
              🔄 Reset Defaults
            </button>
            <button id="load-sheet-print-btn" onClick={handlePrint} style={{ background: ls.operator.trim() ? T.accent : "#86868b", border: "none", color: "#fff", borderRadius: 20, padding: "8px 18px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>🖨 Print</button>
            <button id="load-sheet-email-btn" onClick={() => setShowEmailModal(true)} style={{ background: "#0284c7", border: "none", color: "#fff", borderRadius: 20, padding: "8px 18px", cursor: "pointer", fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: "4px" }}>📧 Send Email</button>
            <button id="load-sheet-close-btn" onClick={onClose} style={{ background: "#e5e7eb", border: "none", color: T.textMid, borderRadius: 20, padding: "8px 16px", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>✕ Close</button>
          </div>
        </div>

        {/* Printable/Editable Content */}
        <div id="loadsheet-print-container" ref={printRef} style={{ padding: 16, fontFamily: "Arial,sans-serif", fontSize: 11, background: "#fff" }}>
          <style>{`
            #loadsheet-print-container input::placeholder, 
            #loadsheet-print-container textarea::placeholder {
              color: #000!important;
              opacity: 1!important;
              -webkit-text-fill-color: #000!important;
              font-weight: bold!important;
            }
            @media print {
              #loadsheet-print-container input::placeholder, 
              #loadsheet-print-container textarea::placeholder {
                color: transparent !important;
                opacity: 0 !important;
                -webkit-text-fill-color: transparent !important;
              }
            }
          `}</style>

          <div id="loadsheet-page-1" className="print-page">
            <div className="print-page-inner">
          {/* TITLE */}
          <div style={{ textAlign: "center", fontSize: 18, fontWeight: "900", border: "2px solid #000000", padding: "3px", marginBottom: 3, letterSpacing: 2 }}>LOAD SHEET</div>
          
          {/* SHIPPER & MAWB ROW */}
          <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1.2fr", marginBottom: 4, border: "2px solid #000000", background: "#ffffff" }}>
            <div style={{ ...cellSt(36), border: "none", borderRight: "2px solid #000000", padding: "4px 8px" }}>
              <span style={lblSt}>SHIPPER</span>
              <input value={ls.shipper} onChange={sl("shipper")} style={{ border: "none", width: "100%", outline: "none", background: "transparent", fontSize: "15px", fontWeight: "900", color: "#000000", textTransform: "uppercase", padding: 0 }} />
            </div>
            <div style={{ ...cellSt(36), border: "none", padding: "4px 8px" }}>
              <span style={lblSt}>MAWB / AWB #</span>
              <input value={ls.mawb} onChange={sl("mawb")} style={{ border: "none", width: "100%", outline: "none", background: "transparent", fontSize: "15px", fontWeight: "900", color: "#000000", padding: 0 }} />
            </div>
          </div>

          {/* OPERATOR, COMMODITY, CUT OFF & FLIGHT INFO */}
          <div style={{ border: "2px solid #000000", display: "grid", gridTemplateColumns: "1fr 2fr 1.2fr 1.1fr 1fr", marginBottom: 4, background: "#ffffff" }}>
            <div style={{ ...cellSt(30), border: "none", borderRight: "2px solid #000000" }}>
              <span style={lblSt}>OPERATOR {!ls.operator.trim() && <span style={{ color: "#dc2626" }}>*required</span>}</span>
              <input value={ls.operator} onChange={sl("operator")} style={{ ...fld, fontSize: 12, fontWeight: 700, border: "none", color: ls.operator.trim() ? "#000000" : "#dc2626" }}/>
            </div>
            <div style={{ ...cellSt(30), border: "none", borderRight: "2px solid #000000" }}>
              <span style={lblSt}>COMMODITY / DESCRIPTION</span>
              <input value={ls.commodity} onChange={sl("commodity")} style={{ ...fld, border: "none", fontWeight: 700 }}/>
            </div>
            <div style={{ ...cellSt(30), border: "none", borderRight: "2px solid #000000" }}>
              <span style={lblSt}>CUT OFF DAY / DATE</span>
              <input value={ls.cutoffDay} onChange={sl("cutoffDay")} style={{ ...fld, fontWeight: 700, border: "none" }}/>
            </div>
            <div style={{ ...cellSt(30), border: "none", borderRight: "2px solid #000000" }}>
              <span style={lblSt}>CUT OFF TIME</span>
              <input value={ls.cutoffTime} onChange={sl("cutoffTime")} style={{ ...fld, fontWeight: 700, border: "none" }}/>
            </div>
            <div style={{ ...cellSt(30), border: "none" }}>
              <span style={lblSt}>FLIGHT</span>
              <input value={ls.flight} onChange={sl("flight")} style={{ ...fld, fontWeight: 700, border: "none" }}/>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", marginBottom: 4, border: "2px solid #000000", background: "#ffffff" }}>
            <div style={{ ...cellSt(30), border: "none", borderRight: "2px solid #000000" }}>
              <span style={lblSt}>DESTINATION</span>
              <input value={ls.destination} onChange={sl("destination")} style={{ ...fld, fontWeight: 700, border: "none" }}/>
            </div>
            <div style={{ ...cellSt(30), border: "none" }}>
              <span style={lblSt}>ULD</span>
              <input value={ls.uld} onChange={sl("uld")} style={{ ...fld, border: "none", fontWeight: 700 }}/>
            </div>
          </div>

          {/* OPTIONS BOX */}
          <div style={{ border: "2px solid #000000", marginBottom: 4, background: "#ffffff", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            {/* Row 1 / Col 1: DRY ICE / GEL PACKS */}
            <div style={{ display: "flex", alignItems: "center", padding: "3px 6px", borderRight: "2px solid #000000", borderBottom: "2px solid #000000" }}>
              <span style={{ fontWeight: "bold", fontSize: 10, marginRight: 6, color: "#000000" }}>DRY ICE / GEL PACKS:</span>
              <label style={{ display: "flex", alignItems: "center", gap: 3, marginRight: 8, cursor: "pointer", fontSize: 10, color: "#000000", fontWeight: "bold" }}>
                <input type="checkbox" checked={ls.dryIceYes} onChange={(e) => setLs((s) => ({ ...s, dryIceYes: e.target.checked, dryIceNo: !e.target.checked }))} style={{ width: 12, height: 12, accentColor: "#000000" }} /> YES
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 3, marginRight: 12, cursor: "pointer", fontSize: 10, color: "#000000", fontWeight: "bold" }}>
                <input type="checkbox" checked={ls.dryIceNo} onChange={(e) => setLs((s) => ({ ...s, dryIceNo: e.target.checked, dryIceYes: !e.target.checked }))} style={{ width: 12, height: 12, accentColor: "#000000" }} /> NO
              </label>
              <span style={{ fontSize: 9, fontWeight: "bold", color: "#000000", marginRight: 3 }}>AMOUNT:</span>
              <input value={ls.dryIceAmount} onChange={sl("dryIceAmount")} style={{ ...fld, width: 60, borderBottom: "1.5px solid #000000", color: "#000000", fontWeight: "bold", fontSize: 10 }} />
            </div>

            {/* Row 1 / Col 2: FOIL */}
            <div style={{ display: "flex", alignItems: "center", padding: "3px 6px", borderBottom: "2px solid #000000" }}>
              <span style={{ fontWeight: "bold", fontSize: 10, marginRight: 10, color: "#000000" }}>FOIL REQUIRED:</span>
              <label style={{ display: "flex", alignItems: "center", gap: 3, marginRight: 12, cursor: "pointer", fontSize: 10, color: "#000000", fontWeight: "bold" }}>
                <input type="checkbox" checked={ls.foilYes} onChange={(e) => setLs((s) => ({ ...s, foilYes: e.target.checked, foilNo: !e.target.checked }))} style={{ width: 12, height: 12, accentColor: "#000000" }} /> YES
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 3, cursor: "pointer", fontSize: 10, color: "#000000", fontWeight: "bold" }}>
                <input type="checkbox" checked={ls.foilNo} onChange={(e) => setLs((s) => ({ ...s, foilNo: e.target.checked, foilYes: !e.target.checked }))} style={{ width: 12, height: 12, accentColor: "#000000" }} /> NO
              </label>
            </div>

            {/* Row 2 / Col 1: TEMP RECORDER */}
            <div style={{ display: "flex", alignItems: "center", padding: "3px 6px", borderRight: "2px solid #000000" }}>
              <span style={{ fontWeight: "bold", fontSize: 10, marginRight: 10, color: "#000000" }}>TEMP RECORDER:</span>
              <label style={{ display: "flex", alignItems: "center", gap: 3, marginRight: 12, cursor: "pointer", fontSize: 10, color: "#000000", fontWeight: "bold" }}>
                <input type="checkbox" checked={ls.tempRecorderYes} onChange={(e) => setLs((s) => ({ ...s, tempRecorderYes: e.target.checked, tempRecorderNo: !e.target.checked }))} style={{ width: 12, height: 12, accentColor: "#000000" }} /> YES
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 3, cursor: "pointer", fontSize: 10, color: "#000000", fontWeight: "bold" }}>
                <input type="checkbox" checked={ls.tempRecorderNo} onChange={(e) => setLs((s) => ({ ...s, tempRecorderNo: e.target.checked, tempRecorderYes: !e.target.checked }))} style={{ width: 12, height: 12, accentColor: "#000000" }} /> NO
              </label>
            </div>

            {/* Row 2 / Col 2: SEALS */}
            <div style={{ display: "flex", alignItems: "center", padding: "3px 6px" }}>
              <span style={{ fontWeight: "bold", fontSize: 10, marginRight: 6, color: "#000000" }}>SEALS:</span>
              <label style={{ display: "flex", alignItems: "center", gap: 3, marginRight: 8, cursor: "pointer", fontSize: 10, color: "#000000", fontWeight: "bold" }}>
                <input type="checkbox" checked={ls.sealsYes} onChange={(e) => setLs((s) => ({ ...s, sealsYes: e.target.checked, sealsNo: !e.target.checked }))} style={{ width: 12, height: 12, accentColor: "#000000" }} /> YES
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 3, marginRight: 12, cursor: "pointer", fontSize: 10, color: "#000000", fontWeight: "bold" }}>
                <input type="checkbox" checked={ls.sealsNo} onChange={(e) => setLs((s) => ({ ...s, sealsNo: e.target.checked, sealsYes: !e.target.checked }))} style={{ width: 12, height: 12, accentColor: "#000000" }} /> NO
              </label>
              <span style={{ fontSize: 9, fontWeight: "bold", color: "#000000", marginRight: 3 }}>INSPECTION REQUIRED @:</span>
              <input value={ls.inspectionAt} onChange={sl("inspectionAt")} style={{ ...fld, width: 60, borderBottom: "1.5px solid #000000", color: "#000000", fontWeight: "bold", fontSize: 10 }} />
            </div>
          </div>

          {/* CARGO TABLE */}
          <table className="cargo-table" style={{ marginBottom: 4, fontSize: 12, width: "100%", borderCollapse: "collapse", border: "2px solid #000000" }}>
            <thead>
              <tr style={{ background: "#000000", color: "#ffffff" }}>
                <th style={{ width: "18%", padding: "7px 6px", fontSize: 13, color: "#ffffff", textTransform: "uppercase", border: "2px solid #000000", fontWeight: "900" }}>GRN</th>
                <th style={{ width: "8%", padding: "7px 6px", fontSize: 13, color: "#ffffff", textTransform: "uppercase", border: "2px solid #000000", fontWeight: "900" }}>SKD COUNT</th>
                <th style={{ width: "8%", padding: "7px 6px", fontSize: 13, color: "#ffffff", textTransform: "uppercase", border: "2px solid #000000", fontWeight: "900" }}>COUNT</th>
                <th style={{ width: "46%", padding: "7px 6px", fontSize: 13, color: "#ffffff", textTransform: "uppercase", border: "2px solid #000000", fontWeight: "900" }}>DESCRIPTION</th>
                <th style={{ width: "10%", padding: "7px 6px", fontSize: 13, color: "#ffffff", textTransform: "uppercase", border: "2px solid #000000", fontWeight: "900" }}>WEIGHT</th>
                <th style={{ width: "5%", padding: "7px 6px", fontSize: 13, color: "#ffffff", textTransform: "uppercase", textAlign: "center", border: "2px solid #000000", fontWeight: "900" }}>PICKED ✓</th>
                <th style={{ width: "5%", padding: "7px 6px", fontSize: 13, color: "#ffffff", textTransform: "uppercase", textAlign: "center", border: "2px solid #000000", fontWeight: "900" }}>CHECKED ✓</th>
              </tr>
            </thead>
            <tbody>
              {ls.cargoRows.map((cr, i) => (
                <tr key={i} style={{ background: "#ffffff" }}>
                  <td style={{ padding: 0, border: "2px solid #000000" }}><input value={cr.grn} onChange={(e) => setCargo(i, "grn", e.target.value)} style={{ ...fld, padding: "9px 9px", border: "none", fontWeight: "bold", fontSize: "17px" }} /></td>
                  <td style={{ padding: 0, border: "2px solid #000000" }}><input value={cr.skd} onChange={(e) => setCargo(i, "skd", e.target.value)} style={{ ...fld, padding: "9px 9px", border: "none", fontWeight: "bold", fontSize: "17px" }} /></td>
                  <td style={{ padding: 0, border: "2px solid #000000" }}><input value={cr.count} onChange={(e) => setCargo(i, "count", e.target.value)} style={{ ...fld, padding: "9px 9px", border: "none", fontWeight: "bold", fontSize: "17px" }} /></td>
                  <td style={{ padding: 0, border: "2px solid #000000" }}><input value={cr.desc} onChange={(e) => setCargo(i, "desc", e.target.value)} style={{ ...fld, padding: "9px 9px", border: "none", fontWeight: "bold", fontSize: "17px" }} /></td>
                  <td style={{ padding: 0, border: "2px solid #000000" }}>
                    <input 
                      value={cr.weight} 
                      onChange={(e) => {
                        const input = e.target;
                        const originalValue = input.value;
                        const selectionStart = input.selectionStart;
                        let clean = originalValue.toUpperCase().replace(/\s*KGS?\s*$/i, "").trim();
                        let formatted = clean ? clean + " KG" : "";
                        setCargo(i, "weight", formatted);
                        if (selectionStart !== null) {
                          setTimeout(() => {
                            let newCursor = selectionStart;
                            if (clean !== "") {
                              const cleanLen = clean.length;
                              if (selectionStart > cleanLen) {
                                newCursor = cleanLen;
                              }
                            }
                            input.setSelectionRange(newCursor, newCursor);
                          }, 0);
                        }
                      }} 
                      style={{ ...fld, padding: "9px 9px", border: "none", fontWeight: "bold", fontSize: "17px" }} 
                    />
                  </td>
                  <td style={{ padding: 0, textAlign: "center", border: "2px solid #000000" }}>
                    <input type="checkbox" checked={cr.picked} onChange={(e) => setCargo(i, "picked", e.target.checked)} style={{ width: 22, height: 22, cursor: "pointer", accentColor: "#000000" }} />
                  </td>
                  <td style={{ padding: 0, textAlign: "center", border: "2px solid #000000" }}>
                    <input type="checkbox" checked={cr.checked} onChange={(e) => setCargo(i, "checked", e.target.checked)} style={{ width: 22, height: 22, cursor: "pointer", accentColor: "#000000" }} />
                  </td>
                </tr>
              ))}
              {/* Totals row */}
              <tr style={{ background: "#ffffff", fontWeight: "bold" }}>
                <td style={{ padding: "7px 6px", fontSize: 13, textTransform: "uppercase", border: "2px solid #000000", textAlign: "right", color: "#000000", fontWeight: "900" }}>LOAD OUT TOTALS:</td>
                <td style={{ padding: "7px 6px", fontSize: 14, border: "2px solid #000000", color: "#000000", fontWeight: "900", textAlign: "center" }}>
                  {totalLoadOutSkd > 0 ? totalLoadOutSkd : "—"}
                </td>
                <td style={{ padding: "7px 6px", fontSize: 14, border: "2px solid #000000", color: "#000000", fontWeight: "900", textAlign: "center" }}>
                  {totalLoadOutCount > 0 ? totalLoadOutCount : "—"}
                </td>
                <td style={{ padding: "7px 6px", fontSize: 13, border: "2px solid #000000" }}></td>
                <td style={{ padding: "7px 6px", fontSize: 14, border: "2px solid #000000", color: "#000000", fontWeight: "900", textAlign: "center" }}>
                  {totalLoadOutWeight > 0 ? `${totalLoadOutWeight.toFixed(1)} KG` : "—"}
                </td>
                <td colSpan={2} style={{ border: "2px solid #000000" }}></td>
              </tr>
            </tbody>
          </table>

          {/* UNITS & SPECIAL INSTRUCTIONS */}
          <div style={{ background: "#000000", color: "#ffffff", fontWeight: 700, fontSize: 11, padding: "3px 6px", textTransform: "uppercase", letterSpacing: "1px", border: "2px solid #000000", borderBottom: "none" }}>UNITS & SPECIAL INSTRUCTIONS</div>
          <div style={{ border: "2px solid #000000", padding: "4px 6px", marginBottom: 4, background: "#ffffff", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 9, fontWeight: "bold", color: "#000000", textTransform: "uppercase", display: "block", marginBottom: 3 }}>UNIT NUMBERS:</span>
              <textarea
                className="with-border"
                value={ls.unitsLine2}
                onChange={(e) => setLs((s) => ({ ...s, unitsLine2: e.target.value.toUpperCase() }))}
                placeholder=""
                style={{
                  ...fld,
                  border: "2px solid #000000",
                  padding: "4px 6px",
                  fontWeight: "bold",
                  height: "150px",
                  boxSizing: "border-box",
                  resize: "none",
                  fontSize: getUnitsFontSize(ls.unitsLine2),
                  lineHeight: "1.25",
                  overflowY: "auto"
                }}
              />
              <span style={{ fontSize: 9, fontWeight: "bold", color: "#000000", textTransform: "uppercase", display: "block", marginTop: 4, marginBottom: 3 }}>DYNAMIC OPTIONS STATUS:</span>
              <div style={{ minHeight: 30, padding: "3px 6px", background: "#ffffff", border: "2px solid #000000", fontSize: 10, fontWeight: "bold", color: "#000000", display: "flex", alignItems: "center", textTransform: "uppercase" }}>
                {getAutoSpecialInstructions() || "NO OPTIONS SELECTED"}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", position: "relative" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                <span style={{ fontSize: 9, fontWeight: "bold", color: "#000000", textTransform: "uppercase" }}>SPECIAL INSTRUCTIONS (FREE-TYPE):</span>
                <button
                  type="button"
                  className="print-hidden"
                  onClick={(e) => {
                    setMenuMode("select");
                    setTemplateSearch("");
                    setTemplateMenu({
                      x: 0,
                      y: 0,
                      visible: true
                    });
                  }}
                  style={{
                    fontSize: 8,
                    fontWeight: "900",
                    color: "#ffffff",
                    background: "#000000",
                    border: "1px solid #000000",
                    borderRadius: 3,
                    padding: "1px 4px",
                    cursor: "pointer",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px"
                  }}
                  title="Click to Choose Shipping/Cargo Instructions Template"
                >
                  📋 Insert Template
                </button>
              </div>
              <textarea
                className="with-border"
                value={ls.customSpecialInstructions}
                onChange={(e) => setLs((s) => ({ ...s, customSpecialInstructions: e.target.value.toUpperCase() }))}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenuMode("select");
                  setTemplateSearch("");
                  setTemplateMenu({ x: 0, y: 0, visible: true });
                }}
                placeholder="RIGHT-CLICK HERE OR USE BUTTON TO PASTE TEMPLATE..."
                style={{
                  ...fld,
                  border: "2px solid #000000",
                  padding: "4px 6px",
                  fontWeight: "bold",
                  height: "170px",
                  boxSizing: "border-box",
                  resize: "none",
                  marginBottom: 2,
                  fontSize: getSopFontSize(ls.customSpecialInstructions),
                  lineHeight: "1.25",
                  overflowY: "auto"
                }}
              />

              {templateMenu && templateMenu.visible && (
                <>
                  {/* Backdrop clickaway interceptor */}
                  <div
                    style={{
                      position: "fixed",
                      inset: 0,
                      zIndex: 1099,
                      background: "transparent",
                    }}
                    onClick={() => {
                      setTemplateMenu(null);
                      setTmplIdToDelete(null);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setTemplateMenu(null);
                      setTmplIdToDelete(null);
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: "26px",
                      right: "0px",
                      background: "#ffffff",
                      border: "3px solid #000000",
                      boxShadow: "6px 6px 0px rgba(0,0,0,1)",
                      zIndex: 1100,
                      width: "100%",
                      maxWidth: "340px",
                      borderRadius: "4px",
                      padding: "0",
                      fontFamily: "inherit",
                      overflow: "hidden"
                    }}
                  >
                    {/* Header Tabs */}
                    <div style={{ display: "flex", borderBottom: "2px solid #000000", background: "#f8fafc" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuMode("select");
                          setTmplIdToDelete(null);
                        }}
                        style={{
                          flex: 1,
                          padding: "8px 6px",
                          fontSize: "9.5px",
                          fontWeight: "900",
                          background: menuMode === "select" ? "#ffffff" : "#e2e8f0",
                          color: "#000000",
                          border: "none",
                          borderRight: "2px solid #000000",
                          cursor: "pointer",
                          textTransform: "uppercase",
                          letterSpacing: "0.2px"
                        }}
                      >
                        📋 Apply / Insert
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuMode("manage");
                          setTmplIdToDelete(null);
                        }}
                        style={{
                          flex: 1,
                          padding: "8px 6px",
                          fontSize: "9.5px",
                          fontWeight: "900",
                          background: (menuMode === "manage" || menuMode === "add" || menuMode === "edit") ? "#ffffff" : "#e2e8f0",
                          color: "#000000",
                          border: "none",
                          cursor: "pointer",
                          textTransform: "uppercase",
                          letterSpacing: "0.2px"
                        }}
                      >
                        ⚙️ Manage templates
                      </button>
                    </div>

                    {/* Tab Body: Selection list */}
                    {menuMode === "select" && (() => {
                      const targetPortValue = (row.station || activePort || "MEL").toUpperCase();
                      const filteredByPort = templates.filter(tmpl => {
                        // Check privacy: if isPrivate is true, it MUST belong to the current user
                        if (tmpl.isPrivate && tmpl.ownerId !== currentUser?.uid) {
                          return false;
                        }
                        if (selectedListTab === "ONLY_ME") {
                          return !!tmpl.isPrivate;
                        } else {
                          const tPort = (tmpl.port || "").toUpperCase();
                          return tPort === targetPortValue || tPort === "ALL";
                        }
                      });
                      const sortedTemplates = [...filteredByPort].sort((a, b) => a.name.localeCompare(b.name));
                      const filteredAndSortedTemplates = sortedTemplates.filter((tmpl) => {
                        const queryStr = templateSearch.toLowerCase();
                        return (
                          tmpl.name.toLowerCase().includes(queryStr) ||
                          tmpl.text.toLowerCase().includes(queryStr)
                        );
                      });
                      
                      return (
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          {/* Search Input Box */}
                          <div style={{ padding: "8px 12px", borderBottom: "2px solid #000000", background: "#f1f5f9" }}>
                            <input
                              type="text"
                              value={templateSearch}
                              onChange={(e) => setTemplateSearch(e.target.value)}
                              placeholder="🔍 SEARCH TEMPLATES..."
                              style={{
                                width: "100%",
                                fontSize: "11px",
                                fontWeight: "bold",
                                border: "2px solid #000000",
                                padding: "4px 8px",
                                borderRadius: "3px",
                                outline: "none",
                                background: "#ffffff",
                                boxSizing: "border-box"
                              }}
                            />
                          </div>

                          {/* Sub-tabs Selection */}
                          <div style={{ display: "flex", borderBottom: "2px solid #000000", background: "#e2e8f0" }}>
                            <button
                              type="button"
                              onClick={() => setSelectedListTab("PORT")}
                              style={{
                                flex: 1,
                                padding: "5px 4px",
                                fontSize: "8.5px",
                                fontWeight: "900",
                                background: selectedListTab === "PORT" ? "#ffffff" : "transparent",
                                color: "#000000",
                                border: "none",
                                borderRight: "2px solid #000000",
                                cursor: "pointer",
                                textTransform: "uppercase"
                              }}
                            >
                              📍 PORT ({(PORT_CITIES[targetPortValue] || targetPortValue).toUpperCase()})
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedListTab("ONLY_ME")}
                              style={{
                                flex: 1,
                                padding: "5px 4px",
                                fontSize: "8.5px",
                                fontWeight: "900",
                                background: selectedListTab === "ONLY_ME" ? "#ffffff" : "transparent",
                                color: "#000000",
                                border: "none",
                                cursor: "pointer",
                                textTransform: "uppercase"
                              }}
                            >
                              🔒 ONLY ME ({templates.filter(t => t.isPrivate && t.ownerId === currentUser?.uid).length})
                            </button>
                          </div>
                          
                          {/* Scrollable Container */}
                          <div style={{ maxHeight: "260px", overflowY: "auto" }}>
                            {filteredAndSortedTemplates.map((tmpl) => (
                              <button
                                key={tmpl.id}
                                onClick={() => {
                                  setLs((prev) => {
                                    const trimmed = (prev.customSpecialInstructions || "").trim();
                                    const appended = trimmed ? `${trimmed}\n${tmpl.text}` : tmpl.text;
                                    return {
                                      ...prev,
                                      customSpecialInstructions: appended.toUpperCase()
                                    };
                                  });
                                  setTemplateMenu(null);
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = "#000000";
                                  e.currentTarget.style.color = "#ffffff";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = "transparent";
                                  e.currentTarget.style.color = "#000000";
                                }}
                                style={{
                                  width: "100%",
                                  padding: "8px 12px",
                                  textAlign: "left",
                                  border: "none",
                                  background: "transparent",
                                  color: "#000000",
                                  fontSize: "10.5px",
                                  fontWeight: "800",
                                  cursor: "pointer",
                                  display: "block",
                                  fontFamily: "inherit",
                                  borderBottom: "1px dashed #e2e8f0",
                                  transition: "all 0.12s"
                                }}
                                title="Click to insert this template text"
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                                  <span style={{ fontWeight: "900", display: "flex", alignItems: "center", gap: "4px" }}>
                                    {tmpl.name}
                                    {tmpl.isPrivate && <span style={{ fontSize: "8px", color: "#ef4444" }} title={`Private to you (${tmpl.ownerUsername || 'Me'})`}>🔒 ONLY ME</span>}
                                  </span>
                                  <span style={{ fontSize: "8px", fontWeight: "900", background: "#f1f5f9", color: "#334155", padding: "1px 4px", borderRadius: "3.5px" }}>
                                    {PORT_CITIES[(tmpl.port || "ALL").toUpperCase()] || tmpl.port}
                                  </span>
                                </div>
                                <div style={{ fontSize: "8.5px", fontWeight: "normal", opacity: 0.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {tmpl.text}
                                </div>
                              </button>
                            ))}
                            {filteredAndSortedTemplates.length === 0 && (
                              <div style={{ padding: "24px 12px", textAlign: "center", fontSize: "11px", color: "#64748b" }}>
                                {templates.length === 0
                                  ? "No templates saved. Click the Manage tab to add custom templates!"
                                  : "No matching templates found."}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Tab Body: Manage templates */}
                    {menuMode === "manage" && (() => {
                      const targetPortValue = (row.station || activePort || "MEL").toUpperCase();
                      const filteredManage = templates.filter(tmpl => {
                        // Check privacy: if isPrivate is true, it MUST belong to the current user
                        if (tmpl.isPrivate && tmpl.ownerId !== currentUser?.uid) {
                          return false;
                        }
                        if (selectedListTab === "ONLY_ME") {
                          return !!tmpl.isPrivate;
                        } else {
                          const tPort = (tmpl.port || "").toUpperCase();
                          return tPort === targetPortValue || tPort === "ALL";
                        }
                      });
                      const sortedManage = [...filteredManage].sort((a, b) => (a.port || "").localeCompare(b.port || "") || a.name.localeCompare(b.name));
                      
                      return (
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          {/* Sub-tabs Selection */}
                          <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "#e2e8f0" }}>
                            <button
                              type="button"
                              onClick={() => setSelectedListTab("PORT")}
                              style={{
                                flex: 1,
                                padding: "5px 4px",
                                fontSize: "8.5px",
                                fontWeight: "900",
                                background: selectedListTab === "PORT" ? "#ffffff" : "transparent",
                                color: "#000000",
                                border: "none",
                                borderRight: "2px solid #000000",
                                cursor: "pointer",
                                textTransform: "uppercase"
                              }}
                            >
                              📍 PORT ({(PORT_CITIES[targetPortValue] || targetPortValue).toUpperCase()})
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedListTab("ONLY_ME")}
                              style={{
                                flex: 1,
                                padding: "5px 4px",
                                fontSize: "8.5px",
                                fontWeight: "900",
                                background: selectedListTab === "ONLY_ME" ? "#ffffff" : "transparent",
                                color: "#000000",
                                border: "none",
                                cursor: "pointer",
                                textTransform: "uppercase"
                              }}
                            >
                              🔒 ONLY ME ({templates.filter(t => t.isPrivate && t.ownerId === currentUser?.uid).length})
                            </button>
                          </div>

                          <div style={{ padding: "8px 12px", borderBottom: "1px solid #e2e8f0" }}>
                            <button
                              type="button"
                              onClick={() => {
                                setMenuMode("add");
                                setTempName("");
                                setTempText("");
                                setTempPort(targetPortValue);
                                setTempIsPrivate(selectedListTab === "ONLY_ME");
                                setTmplIdToDelete(null);
                              }}
                              style={{
                                width: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "4px",
                                background: "#000000",
                                color: "#ffffff",
                                border: "1px solid #000000",
                                borderRadius: "3px",
                                padding: "6px",
                                fontSize: "10px",
                                fontWeight: "800",
                                cursor: "pointer",
                                textTransform: "uppercase"
                              }}
                            >
                              <Plus size={11} /> ➕ Create New Template
                            </button>
                          </div>
                          <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                            {sortedManage.map((tmpl) => (
                              <div
                                key={tmpl.id}
                                style={{
                                  padding: "8px 12px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  borderBottom: "1px dashed #e2e8f0",
                                  gap: 8
                                }}
                              >
                                <div style={{ overflow: "hidden", flex: 1 }}>
                                  <div style={{ fontSize: "10.5px", fontWeight: "800", color: "#000000", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 4 }}>
                                    <span>{tmpl.name}</span>
                                    <span style={{ fontSize: "8px", fontWeight: "900", background: "#f1f5f9", color: "#64748b", padding: "1px 3px", borderRadius: "3px" }}>
                                      {PORT_CITIES[(tmpl.port || "ALL").toUpperCase()] || tmpl.port}
                                    </span>
                                    {tmpl.isPrivate && (
                                      <span style={{ fontSize: "7px", fontWeight: "900", background: "#fef2f2", color: "#ef4444", padding: "1px 3px", borderRadius: "3px", display: "inline-flex", alignItems: "center" }} title={`Private to ${tmpl.ownerUsername || 'you'}`}>
                                        🔒 ONLY ME
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: "8.5px", color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {tmpl.text}
                                  </div>
                                </div>
                                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setMenuMode("edit");
                                      setEditTmplId(tmpl.id);
                                      setTempName(tmpl.name);
                                      setTempText(tmpl.text);
                                      setTempPort(tmpl.port || targetPortValue);
                                      setTempIsPrivate(!!tmpl.isPrivate);
                                      setTmplIdToDelete(null);
                                    }}
                                    style={{
                                      padding: "4px",
                                      background: "#f1f5f9",
                                      border: "1px solid #000000",
                                      borderRadius: "3px",
                                      cursor: "pointer",
                                      color: "#000000"
                                    }}
                                    title="Edit template label or content"
                                  >
                                    <Edit size={10} />
                                  </button>
                                  {tmplIdToDelete === tmpl.id ? (
                                    <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                                      <span style={{ fontSize: "8px", fontWeight: "900", color: "#b91c1c", marginRight: 2 }}>SURE?</span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteExistingTemplate(tmpl.id);
                                          setTmplIdToDelete(null);
                                        }}
                                        style={{
                                          padding: "2px 4px",
                                          background: "#dc2626",
                                          color: "#ffffff",
                                          border: "1px solid #991b1b",
                                          borderRadius: "2px",
                                          fontSize: "8px",
                                          fontWeight: "900",
                                          cursor: "pointer",
                                        }}
                                      >
                                        YES
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setTmplIdToDelete(null);
                                        }}
                                        style={{
                                          padding: "2px 4px",
                                          background: "#f1f5f9",
                                          color: "#000000",
                                          border: "1px solid #475569",
                                          borderRadius: "2px",
                                          fontSize: "8px",
                                          fontWeight: "900",
                                          cursor: "pointer",
                                        }}
                                      >
                                        NO
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setTmplIdToDelete(tmpl.id);
                                      }}
                                      style={{
                                        padding: "4px",
                                        background: "#fee2e2",
                                        border: "1px solid #991b1b",
                                        borderRadius: "3px",
                                        cursor: "pointer",
                                        color: "#991b1b"
                                      }}
                                      title="Delete template"
                                    >
                                      <Trash2 size={10} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                            {sortedManage.length === 0 && (
                              <div style={{ padding: "20px 12px", textAlign: "center", fontSize: "11px", color: "#64748b" }}>
                                No templates configured.
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Tab Body: Add or Edit Form */}
                    {(menuMode === "add" || menuMode === "edit") && (() => {
                      const targetPortValue = (row.station || activePort || "MEL").toUpperCase();
                      
                      return (
                        <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <button
                              type="button"
                              onClick={() => {
                                setMenuMode("manage");
                              }}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "#000000",
                                cursor: "pointer",
                                padding: 0,
                                display: "flex",
                                alignItems: "center"
                              }}
                            >
                              <ArrowLeft size={13} />
                            </button>
                            <span style={{ fontSize: "9px", fontWeight: "950", textTransform: "uppercase", color: "#000000" }}>
                              {menuMode === "add" ? "Create Template" : "Edit Template"}
                            </span>
                          </div>
                          <div>
                            <label style={{ fontSize: "8px", fontWeight: "900", color: "#000000", display: "block", marginBottom: "3px", textTransform: "uppercase" }}>
                              Template label / icon:
                            </label>
                            <input
                              type="text"
                              value={tempName}
                              onChange={(e) => setTempName(e.target.value)}
                              placeholder=""
                              style={{
                                width: "100%",
                                fontSize: "11px",
                                fontWeight: "bold",
                                border: "2px solid #000000",
                                padding: "4px 6px",
                                borderRadius: "3px",
                                outline: "none",
                                background: "#ffffff"
                              }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: "8px", fontWeight: "900", color: "#000000", display: "block", marginBottom: "3px", textTransform: "uppercase" }}>
                              Special instructions text:
                            </label>
                            <textarea
                              value={tempText}
                              onChange={(e) => setTempText(e.target.value)}
                              placeholder=""
                              rows={4}
                              style={{
                                width: "100%",
                                fontSize: "10px",
                                fontWeight: "bold",
                                border: "2px solid #000000",
                                padding: "6px 8px",
                                borderRadius: "3px",
                                outline: "none",
                                resize: "none",
                                background: "#ffffff"
                              }}
                            />
                          </div>

                          {/* Port selection / view */}
                          {isAdmin ? (
                            <div>
                              <label style={{ fontSize: "8px", fontWeight: "900", color: "#000000", display: "block", marginBottom: "3px", textTransform: "uppercase" }}>
                                Template Port (Admin Only):
                              </label>
                              <select
                                value={tempPort || targetPortValue}
                                onChange={(e) => setTempPort(e.target.value)}
                                style={{
                                  width: "105%",
                                  fontSize: "11px",
                                  fontWeight: "bold",
                                  border: "2px solid #000000",
                                  padding: "4px 6px",
                                  borderRadius: "3px",
                                  outline: "none",
                                  background: "#ffffff"
                                }}
                              >
                                {["ALL", "MEL", "SYD", "BNE", "CNS", "PER", "ADL"].map((st) => (
                                  <option key={st} value={st}>{PORT_CITIES[st] || st}</option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div>
                              <label style={{ fontSize: "8px", fontWeight: "900", color: "#000000", display: "block", marginBottom: "3px", textTransform: "uppercase" }}>
                                Template Port:
                              </label>
                              <div style={{
                                fontSize: "11px",
                                fontWeight: "bold",
                                border: "2px solid #e2e8f0",
                                background: "#f8fafc",
                                padding: "4px 6px",
                                borderRadius: "3px",
                                color: "#64748b"
                              }}>
                                📌 {PORT_CITIES[(tempPort || targetPortValue).toUpperCase()] || (tempPort || targetPortValue)} (Locked to your Station)
                              </div>
                            </div>
                          )}

                          {/* Privacy option checkbox */}
                          <div style={{ marginTop: "4px", marginBottom: "4px" }}>
                            <label style={{ fontSize: "9px", fontWeight: "900", color: "#000000", display: "flex", alignItems: "center", gap: "4px", cursor: "pointer", userSelect: "none" }}>
                              <input
                                type="checkbox"
                                checked={tempIsPrivate}
                                onChange={(e) => setTempIsPrivate(e.target.checked)}
                                style={{ cursor: "pointer" }}
                              />
                              🔒 Private Template (Only Me)
                            </label>
                            <span style={{ fontSize: "7.5px", color: "#64748b", display: "block", marginLeft: "14px", marginTop: "1px" }}>
                              Visible only to: {currentUser?.displayName || currentUser?.email || "you"}
                            </span>
                          </div>

                          <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                            <button
                              type="button"
                              onClick={() => {
                                if (!tempName.trim()) {
                                  alert("Template title is required!");
                                  return;
                                }
                                if (!tempText.trim()) {
                                  alert("Instruction text is required!");
                                  return;
                                }

                                const targetP = tempPort || targetPortValue;
                                if (menuMode === "add") {
                                  handleAddNewTemplate(tempName, tempText, targetP, tempIsPrivate);
                                } else if (menuMode === "edit" && editTmplId) {
                                  handleEditExistingTemplate(editTmplId, tempName, tempText, targetP, tempIsPrivate);
                                }

                                setMenuMode("manage");
                                setTempName("");
                                setTempText("");
                                setTempIsPrivate(false);
                                setEditTmplId(null);
                              }}
                              style={{
                                flex: 1,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "4px",
                                background: "#22c55e",
                                color: "#ffffff",
                                border: "1px solid #16a34a",
                                borderRadius: "3px",
                                padding: "6px 8px",
                                fontSize: "10px",
                                fontWeight: "900",
                                cursor: "pointer",
                                textTransform: "uppercase"
                              }}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setMenuMode("manage");
                                setTempName("");
                                setTempText("");
                                setEditTmplId(null);
                              }}
                              style={{
                                flex: 1,
                                background: "#f1f5f9",
                                color: "#334155",
                                border: "1px solid #cbd5e1",
                                borderRadius: "3px",
                                padding: "6px 8px",
                                fontSize: "10px",
                                fontWeight: "900",
                                cursor: "pointer",
                                textTransform: "uppercase"
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    <div style={{ borderTop: "2px solid #000000", margin: "0" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setTemplateMenu(null);
                          setTmplIdToDelete(null);
                        }}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          textAlign: "center",
                          border: "none",
                          background: "#fee2e2",
                          color: "#991b1b",
                          fontSize: "10px",
                          fontWeight: "900",
                          cursor: "pointer",
                          letterSpacing: "0.5px"
                        }}
                      >
                        ✕ CLOSE TEMPLATES
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* TEMPERATURE REQUIREMENTS BOX */}
          <div style={{ border: "2px solid #000000", marginBottom: 4, background: "#ffffff", display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
            <div style={{ padding: "4px 6px", borderRight: "2px solid #000000", minHeight: 45, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <span style={{ ...lblSt, color: "#000000", fontSize: 10, fontWeight: "bold" }}>TEMP 1:</span>
              <div style={{ display: "flex", alignItems: "center" }}>
                <input value={ls.loadOutTemp1} onChange={sl("loadOutTemp1")} style={{ ...fld, border: "none", fontWeight: "bold", color: "#000000", fontSize: "16px" }}/>
                <span style={{ fontSize: 13, fontWeight: "bold", color: "#000000" }}>°C</span>
              </div>
            </div>
            <div style={{ padding: "4px 6px", borderRight: "2px solid #000000", minHeight: 45, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <span style={{ ...lblSt, color: "#000000", fontSize: 10, fontWeight: "bold" }}>TEMP 2:</span>
              <div style={{ display: "flex", alignItems: "center" }}>
                <input value={ls.loadOutTemp2} onChange={sl("loadOutTemp2")} style={{ ...fld, border: "none", fontWeight: "bold", color: "#000000", fontSize: "16px" }}/>
                <span style={{ fontSize: 13, fontWeight: "bold", color: "#000000" }}>°C</span>
              </div>
            </div>
            <div style={{ padding: "4px 6px", minHeight: 45, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <span style={{ ...lblSt, color: "#000000", fontSize: 10, fontWeight: "bold" }}>TEMP 3:</span>
              <div style={{ display: "flex", alignItems: "center" }}>
                <input value={ls.loadOutTemp3} onChange={sl("loadOutTemp3")} style={{ ...fld, border: "none", fontWeight: "bold", color: "#000000", fontSize: "16px" }}/>
                <span style={{ fontSize: 13, fontWeight: "bold", color: "#000000" }}>°C</span>
              </div>
            </div>
          </div>

          {/* SIGN-OFF */}
          <div style={{ background: "#000000", color: "#ffffff", fontWeight: 700, fontSize: 11, padding: "3px 6px", textTransform: "uppercase", letterSpacing: "1px", border: "2px solid #000000", borderBottom: "none" }}>Warehouse Staff Sign-Off</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr", border: "2px solid #000000", background: "#ffffff" }}>
            {[
              ["pickedBy", "PICKED BY"],
              ["checkedBy", "CHECKED BY SUPERVISOR"],
              ["loadedBy", "LOADED BY"],
              ["dateIn", "DATE IN"],
              ["dateOut", "DATE OUT"],
            ].map(([k, lbl], idx) => (
              <div 
                key={k} 
                style={{ 
                  padding: "4px 6px", 
                  minHeight: 76, 
                  background: "#ffffff", 
                  display: "flex", 
                  flexDirection: "column", 
                  justifyContent: "space-between",
                  borderRight: idx < 4 ? "2px solid #000000" : "none" 
                }}
              >
                <span style={{ ...lblSt, fontSize: 8, fontWeight: "900", letterSpacing: "0.02em" }}>{lbl}</span>
                <div style={{ display: "flex", flexDirection: "column", width: "100%", marginTop: "auto" }}>
                  <input 
                    value={ls[k as keyof typeof ls] as string} 
                    onChange={sl(k as keyof typeof ls)} 
                    style={{ 
                      border: "none", 
                      outline: "none", 
                      width: "100%", 
                      fontSize: "11px", 
                      fontFamily: "inherit", 
                      background: "transparent", 
                      padding: "1px 1px", 
                      color: "#000000", 
                      fontWeight: "bold",
                      textAlign: "center"
                    }} 
                  />
                  <div style={{ borderBottom: "2px solid #000000", width: "95%", margin: "0 auto", marginTop: "1px" }} />
                </div>
              </div>
            ))}
          </div>
          </div>
          </div>

          {/* INVITATION TO ADD CARCASES SHEET IF DISABLED (HIDDEN FROM PRINTING) */}
          {!includeCarcases && (
            <div
              className="print-hidden"
              style={{
                background: "#fdf8f6",
                border: "2px dashed #f97316",
                borderRadius: 12,
                padding: "20px",
                textAlign: "center",
                marginTop: 20,
              }}
            >
              <span style={{ fontSize: "28px", display: "block", marginBottom: 6 }}>🥩</span>
              <h4 style={{ fontWeight: 800, color: "#9a3412", fontSize: 14, margin: "0 0 6px 0" }}>Additional Carcases Attachment Available</h4>
              <p style={{ fontSize: 12, color: "#ea580c", margin: "0 auto 12px auto", maxWidth: 500 }}>
                Would you like to attach a structured <strong>CCS Control Sheet</strong> to this load out document? Click below to generate Page 2 automatically.
              </p>
              <button
                type="button"
                onClick={() => setIncludeCarcases(true)}
                style={{
                  background: "#f97316",
                  border: "none",
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 700,
                  borderRadius: 20,
                  padding: "8px 24px",
                  cursor: "pointer",
                  boxShadow: "0 2px 4px rgba(249,115,22,0.2)"
                }}
              >
                ➕ Add CCS Control Sheet (Page 2)
              </button>
            </div>
          )}

          {/* PAGE 2 - CARCASES SHEET */}
          {includeCarcases && (
            <div
              id="loadsheet-page-2"
              className="print-page page-break"
              style={{
                pageBreakBefore: "always",
                marginTop: 30,
                borderTop: "3px dashed #ea580c",
                paddingTop: 30,
              }}
            >
              <div className="print-page-inner">
              {/* Editor visual indicator header - hidden when print */}
              <div
                className="print-hidden"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "#eff6ff",
                  border: "1px solid #dbeafe",
                  borderRadius: 12,
                  padding: "10px 16px",
                  marginBottom: 16,
                }}
              >
                <div>
                  <span style={{ fontWeight: 800, color: "#1d4ed8", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                    📊 PAGE 2 — CARCASE CCS CONTROL SHEET ACTIVE
                  </span>
                  <div style={{ fontSize: 11, color: "#1e3a8a", marginTop: 2 }}>
                    Fill PMC/ALF skid units below; each card supports 4 tally rows. Enter values freely.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIncludeCarcases(false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#1d4ed8",
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Remove Page 2
                </button>
              </div>

              {/* Title Block */}
              <div style={{ textTransform: "uppercase", textAlign: "center", fontSize: 22, fontWeight: "900", border: "2px solid #000000", padding: "6px", marginBottom: 4, letterSpacing: 2 }}>
                CARCASE CONTROL SHEET
              </div>

              {/* LARGE SHIPPER BOX */}
              <div style={{ border: "2px solid #000000", padding: "6px 12px", marginBottom: 12, background: "#ffffff" }}>
                <span style={lblSt}>SHIPPER</span>
                <input
                  type="text"
                  value={ccsMeta.shipper}
                  onChange={(e) => setCcsMeta({ ...ccsMeta, shipper: e.target.value.toUpperCase() })}
                  style={{ border: "none", width: "100%", outline: "none", background: "transparent", fontSize: "18px", fontWeight: "900", color: "#000000", textTransform: "uppercase" }}
                />
              </div>

              {/* Header Form Grid */}
              <div style={{ border: '2px solid #000000', marginBottom: 12, background: "#ffffff" }}>
                {/* Row 1: OPERATOR */}
                <div style={{ display: 'flex', borderBottom: '2px solid #000000', height: 32 }}>
                  <div style={{ width: 160, background: '#000000', color: '#ffffff', fontWeight: 'bold', display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: 10, borderRight: '2px solid #000000', textTransform: "uppercase" }}>
                    OPERATOR
                  </div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 8px' }}>
                    <input type="text" value={ccsMeta.operator} onChange={(e) => setCcsMeta({ ...ccsMeta, operator: e.target.value.toUpperCase() })} style={{ width: '100%', fontSize: 12, fontWeight: 'bold' }} />
                  </div>
                </div>

                {/* Row 2: MAWB */}
                <div style={{ display: 'flex', borderBottom: '2px solid #000000', height: 32 }}>
                  <div style={{ width: 160, background: '#000000', color: '#ffffff', fontWeight: 'bold', display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: 10, borderRight: '2px solid #000000' }}>
                    MAWB
                  </div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 8px' }}>
                    <input type="text" value={ccsMeta.mawb} onChange={(e) => setCcsMeta({ ...ccsMeta, mawb: formatAwb(e.target.value.toUpperCase(), ccsMeta.mawb) })} style={{ width: '100%', fontSize: 12, fontWeight: 'bold' }} />
                  </div>
                </div>

                {/* Row 4: FLIGHT & CUT OFF */}
                <div style={{ display: 'flex', borderBottom: '2px solid #000000', height: 32 }}>
                  <div style={{ width: 160, background: '#000000', color: '#ffffff', fontWeight: 'bold', display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: 10, borderRight: '2px solid #000000' }}>
                    FLIGHT
                  </div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 8px', borderRight: '2px solid #000000' }}>
                    <input type="text" value={ccsMeta.flight} onChange={(e) => setCcsMeta({ ...ccsMeta, flight: e.target.value.toUpperCase() })} style={{ width: '100%', fontSize: 12, fontWeight: 'bold' }} />
                  </div>
                  <div style={{ width: 150, background: '#000000', color: '#ffffff', fontWeight: 'bold', display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: 10, borderRight: '2px solid #000000', borderLeft: '2px solid #000000' }}>
                    CUT OFF DATE/TIME
                  </div>
                  <div style={{ width: 200, display: 'flex', alignItems: 'center', padding: '0 8px' }}>
                    <input type="text" value={ccsMeta.cutoffDateTime} onChange={(e) => setCcsMeta({ ...ccsMeta, cutoffDateTime: e.target.value })} style={{ width: '100%', fontSize: 11, fontWeight: 'bold' }} />
                  </div>
                </div>

                {/* Row 5: DESTINATION */}
                <div style={{ display: 'flex', borderBottom: '2px solid #000000', height: 32 }}>
                  <div style={{ width: 160, background: '#000000', color: '#ffffff', fontWeight: 'bold', display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: 10, borderRight: '2px solid #000000' }}>
                    DESTINATION
                  </div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 8px' }}>
                    <input type="text" value={ccsMeta.destination} onChange={(e) => setCcsMeta({ ...ccsMeta, destination: e.target.value.toUpperCase() })} style={{ width: '100%', fontSize: 12, fontWeight: 'bold' }} />
                  </div>
                </div>

                {/* Row 6: CARCASES BOOKED & ACTUAL QTY */}
                <div style={{ display: 'flex', height: 32 }}>
                  <div style={{ width: 160, background: '#000000', color: '#ffffff', fontWeight: 'bold', display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: 10, borderRight: '2px solid #000000' }}>
                    CARCASES BOOKED
                  </div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 8px', borderRight: '2px solid #000000' }}>
                    <input
                      type="text"
                      value={ccsMeta.quantityBooked || (totalLoadOutCount > 0 ? `${totalLoadOutCount} CCS` : "")}
                      onChange={(e) => setCcsMeta({ ...ccsMeta, quantityBooked: e.target.value.toUpperCase() })}
                      style={{ width: '100%', fontSize: 12, fontWeight: 'bold' }}
                    />
                  </div>
                  <div style={{ width: 150, background: '#000000', color: '#ffffff', fontWeight: 'bold', display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: 10, borderRight: '2px solid #000000', borderLeft: '2px solid #000000' }}>
                    ACTUAL QTY
                  </div>
                  <div style={{ width: 200, display: 'flex', alignItems: 'center', padding: '0 8px' }}>
                    <input
                      type="text"
                      value={ccsMeta.actualQty}
                      onChange={(e) => setCcsMeta({ ...ccsMeta, actualQty: e.target.value.toUpperCase() })}
                      style={{ width: '100%', fontSize: 12, fontWeight: 'bold' }}
                    />
                  </div>
                </div>
              </div>

              {/* 6 Grid Units (3 per row) */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: "10px",
                  marginBottom: "12px"
                }}
              >
                {ccsUnits.map((u) => {
                  return (
                    <div
                      key={u.id}
                      style={{
                        border: "2px solid #000000",
                        background: "#ffffff",
                        borderRadius: "2px",
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden"
                      }}
                    >
                      {/* Unit ID header - Doubled in size */}
                      <div
                        style={{
                          display: "flex",
                          borderBottom: "2px solid #000000",
                          padding: "8px 12px",
                          alignItems: "center",
                          minHeight: 48,
                          background: "#ffffff"
                        }}
                      >
                        <span style={{ color: "#dc2626", fontWeight: "900", fontSize: 22, marginRight: 8, letterSpacing: 0.5 }}>
                          UNIT#
                        </span>
                        <input
                          type="text"
                          value={u.unitNo}
                          onChange={(e) => updateCcsUnit(u.id, "unitNo", e.target.value.toUpperCase())}
                          style={{
                            flex: 1,
                            fontSize: 22,
                            fontWeight: "900",
                            padding: 0,
                            border: "none",
                            outline: "none",
                            height: 32,
                            color: "#000000"
                          }}
                        />
                      </div>
 
                      {/* CCS Loaded (formerly Qty Loaded) */}
                      <div
                        style={{
                          background: "#000000",
                          color: "#ffffff",
                          fontSize: 9,
                          fontWeight: "bold",
                          textAlign: "center",
                          padding: "3px 0",
                          borderBottom: "2px solid #000000"
                        }}
                      >
                        CCS LOADED
                      </div>
                      <div
                        style={{
                          borderBottom: "2px solid #000000",
                          height: 26,
                          display: "flex",
                          alignItems: "center",
                          padding: "0 6px"
                        }}
                      >
                        <input
                          type="text"
                          value={u.qtyLoaded}
                          onChange={(e) => updateCcsUnit(u.id, "qtyLoaded", e.target.value.toUpperCase())}
                          style={{
                            width: "100%",
                            fontSize: 11,
                            fontWeight: "bold",
                            textAlign: "center",
                            padding: 0
                          }}
                        />
                      </div>
 
                      {/* Total >> header */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          borderBottom: "2px solid #000000",
                          padding: "4px 6px",
                          background: "#f4f4f5"
                        }}
                      >
                        <span style={{ fontSize: 9, fontWeight: "bold", color: "#333", marginRight: 6 }}>
                          TOTAL &gt;&gt;
                        </span>
                        <input
                          type="text"
                          value={u.total}
                          onChange={(e) => updateCcsUnit(u.id, "total", e.target.value.toUpperCase())}
                          style={{
                            flex: 1,
                            fontSize: 11,
                            fontWeight: "900",
                            color: "#1e3a8a",
                            padding: 0
                          }}
                        />
                      </div>

                      {/* Four tally text lines */}
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {u.tallies.map((val, tIdx) => (
                          <div
                            key={tIdx}
                            style={{
                              borderBottom: tIdx < 3 ? "1.5px solid #000000" : "none",
                              height: 24,
                              display: "flex",
                              alignItems: "center",
                              padding: "0 6px"
                            }}
                          >
                            <input
                              type="text"
                              value={val}
                              onChange={(e) => updateCcsTally(u.id, tIdx, e.target.value.toUpperCase())}
                              style={{
                                width: "100%",
                                fontSize: 10,
                                height: "100%",
                                border: "none",
                                padding: 0
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Comments Box */}
              <div style={{ border: '2px solid #000000', overflow: 'hidden', background: '#ffffff', marginBottom: 12 }}>
                <div style={{ background: '#000000', color: '#ffffff', fontWeight: 'bold', fontSize: 10, fontStyle: 'italic', padding: '4px 8px', letterSpacing: '0.5px' }}>
                  COMMENTS (If short or over qty). NOTIFY OFFICE IMMEDIATELY
                </div>
                <div style={{ padding: '6px 8px' }}>
                  <textarea
                    value={ccsMeta.comments}
                    onChange={(e) => setCcsMeta({ ...ccsMeta, comments: e.target.value.toUpperCase() })}
                    style={{ width: '100%', height: 48, fontSize: 11, border: 'none', resize: 'none', background: 'transparent', outline: 'none' }}
                  />
                </div>
              </div>

              {/* Signatures Form footer */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                <div style={{ border: '2px solid #000000', background: '#ffffff' }}>
                  <div style={{ background: '#000000', color: '#ffffff', fontWeight: 'bold', padding: '4px 8px', fontSize: 10 }}>
                    CHECKED BY:
                  </div>
                  <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={ccsMeta.checkedBy}
                      onChange={(e) => setCcsMeta({ ...ccsMeta, checkedBy: e.target.value.toUpperCase() })}
                      style={{ fontSize: 11, fontWeight: 'bold' }}
                    />
                  </div>
                </div>
                <div style={{ border: '2px solid #000000', background: '#ffffff' }}>
                  <div style={{ background: '#000000', color: '#ffffff', fontWeight: 'bold', padding: '4px 8px', fontSize: 10 }}>
                    TEAM RESPONSIBLE
                  </div>
                  <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={ccsMeta.teamResponsible}
                      onChange={(e) => setCcsMeta({ ...ccsMeta, teamResponsible: e.target.value.toUpperCase() })}
                      style={{ fontSize: 11, fontWeight: 'bold' }}
                    />
                  </div>
                </div>
              </div>
            </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
