/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { 
  Plane, 
  Layers, 
  PlusCircle, 
  CheckCircle, 
  ListCheck, 
  Settings2, 
  Clock, 
  AlertTriangle, 
  Database, 
  RefreshCw,
  LogOut,
  Sliders,
  Sparkles,
  Smartphone,
  Monitor,
  Calendar,
  Mail
} from "lucide-react";
import { Shipment, FlightSchedule } from "./types";
import { DEFAULT_SCHEDULE, SEED_DATA } from "./data/mockData";
import { T } from "./utils/theme";
import { ShipmentsTab, buildDuplicateSets } from "./components/ShipmentsTab";
import { EntryForm } from "./components/EntryForm";
import { FlightAdmin } from "./components/FlightAdmin";
import { DateRangeSearch } from "./components/DateRangeSearch";
import { JobSheetModal } from "./components/JobSheetModal";
import { LoadsheetModal } from "./components/LoadsheetModal";
import { InviteModal } from "./components/InviteModal";
import { SeawayLogo } from "./components/SeawayLogo";
import { subtractHour, todayStr, toDisplay } from "./utils/helpers";
import { doc, getDoc, setDoc, deleteDoc, updateDoc, collection, onSnapshot, query, where } from "firebase/firestore";
import { onAuthStateChanged, signInWithPopup, signOut, User } from "firebase/auth";
import { auth, db, googleProvider, OperationType, handleFirestoreError } from "./lib/firebase";

const STATION_PROFILES = [
  {
    name: "Melbourne Export Air (MAP)",
    email: "melexpair@seaway.com.au",
    code: "SW-P9VGV1E1NA",
    color: "#0284c7", // Sky Blue
    initials: "MAP",
  },
  {
    name: "MELAIRWAY",
    email: "mel.exports@airway.com.au",
    code: "SW-P9VGV1E1NA",
    color: "#6366f1", // Indigo
    initials: "MA",
  },
  {
    name: "Mel Airport Warehouse",
    email: "map.warehouse@airway.com.au",
    code: "SW-P9VGV1E1NA",
    color: "#eab308", // Amber
    initials: "MAW",
  },
];

export default function App() {
  // Firebase Auth states
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Passcode-based Direct Workspace Access State (coworkers bypass Google login)
  const [guestUser, setGuestUser] = useState<{ uid: string; displayName: string; email: string } | null>(() => {
    const savedId = localStorage.getItem("seaway_guest_id");
    const savedName = localStorage.getItem("seaway_guest_name");
    const savedEmail = localStorage.getItem("seaway_guest_email");
    if (savedId && savedName) {
      return { uid: savedId, displayName: savedName, email: savedEmail || "guest@seaway.com" };
    }
    return null;
  });

  const currentUser = user || guestUser;

  const [selectedProfile, setSelectedProfile] = useState<{ name: string; email: string; code: string; color: string; initials: string } | null>(null);
  const [pinInput, setPinInput] = useState<string>("");
  const [pinError, setPinError] = useState<string>("");
  const [submittingAuth, setSubmittingAuth] = useState(false);
  const [authError, setAuthError] = useState("");

  // In-App Staff Accounts/Passcode Ledger States
  const [workUsers, setWorkUsers] = useState<any[]>([]);
  const [adminAddName, setAdminAddName] = useState("");
  const [adminAddEmail, setAdminAddEmail] = useState("");
  const [adminAddPasscode, setAdminAddPasscode] = useState("1234");
  const [adminAddError, setAdminAddError] = useState("");
  const [adminAddSuccess, setAdminAddSuccess] = useState("");
  const [isSubmittingAdminUser, setIsSubmittingAdminUser] = useState(false);
  const [activeInviteUser, setActiveInviteUser] = useState<{ displayName: string; email: string; passcode: string } | null>(null);

  // States synchronized from Cloud Storage
  const [records, setRecords] = useState<Shipment[]>([]);
  const [schedule, setSchedule] = useState<FlightSchedule>(DEFAULT_SCHEDULE);

  // Workspace state to allow real-time cross-device collaboration in Company Mode
  const [workspaceId, setWorkspaceId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const wsParam = params.get("workspaceId") || params.get("ws");
      if (wsParam) {
        localStorage.setItem("seaway_workspace_id", wsParam);
        return wsParam;
      }
    }
    return localStorage.getItem("seaway_workspace_id") || "";
  });
  const [workspaceName, setWorkspaceName] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const nameParam = params.get("workspaceName") || params.get("wsName");
      if (nameParam) {
        localStorage.setItem("seaway_workspace_name", nameParam);
        return nameParam;
      }
    }
    return localStorage.getItem("seaway_workspace_name") || "Personal Workspace";
  });
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [dbError, setDbError] = useState<string>("");
  const [offlineMode, setOfflineMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("seaway_offline_mode") === "true";
    }
    return false;
  });

  const [activeTab, setActiveTab] = useState<"manifest" | "search" | "add" | "flights">("manifest");
  const [editingShipment, setEditingShipment] = useState<Shipment | null>(null);

  // Modal displays
  const [activeJobSheet, setActiveJobSheet] = useState<Shipment | null>(null);
  const [activeLoadsheet, setActiveLoadsheet] = useState<Shipment | null>(null);

  const isMAPUser = (u: any) => {
    if (!u) return false;
    const email = (u.email || "").toLowerCase();
    const uid = (u.uid || "").toLowerCase();
    return email === "melexpair@seaway.com.au" || 
           email === "mel.exports@airway.com.au" || 
           email === "map.warehouse@airway.com.au" ||
           uid.includes("melexpair") ||
           uid.includes("mel_exports") ||
           uid.includes("map_warehouse") ||
           uid.includes("p9vgv1e1na");
  };

  const getCombinedProfiles = () => {
    const combined = [...STATION_PROFILES];
    const defaultEmails = new Set(STATION_PROFILES.map(p => p.email.toLowerCase()));
    
    workUsers.forEach((user, index) => {
      const emailLower = user.email.toLowerCase();
      if (!defaultEmails.has(emailLower)) {
        const colors = ["#ec4899", "#8b5cf6", "#10b981", "#f97316", "#06b6d4"];
        const color = colors[index % colors.length];
        const initials = user.displayName
          ? user.displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 3).toUpperCase()
          : "ST";
          
        combined.push({
          name: user.displayName,
          email: user.email,
          code: "SW-P9VGV1E1NA",
          color: color,
          initials: initials,
        });
      }
    });
    
    return combined;
  };

  const handleProfileSignIn = async (profile: any, pin: string, remainsOffline: boolean = false) => {
    if (pin !== "1234") {
      setPinError("❌ Invalid Security PIN. Please try again.");
      return;
    }
    
    setSubmittingAuth(true);
    setPinError("");
    
    // Standard logins automatically cloud-synchronize by setting offline mode to false
    const shouldBeOffline = remainsOffline;
    if (!shouldBeOffline) {
      setOfflineMode(false);
      localStorage.setItem("seaway_offline_mode", "false");
    }
    
    try {
      const email = profile.email;
      const passcode = "1234";
      const safeDocId = email.replace(/[@.]/g, "_");
      
      let uid = `guest_${safeDocId}_seaway_local`;
      let displayName = profile.name;
      
      if (!shouldBeOffline) {
        try {
          const userRef = doc(db, "work_users", safeDocId);
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              uid,
              displayName,
              email,
              passcode,
              createdAt: new Date().toISOString(),
            });
          } else {
            const data = userSnap.data();
            uid = data.uid || uid;
            displayName = data.displayName || displayName;
          }
        } catch (dbErr) {
          console.warn("Database failed to load profile, bypassing to local mode:", dbErr);
          setOfflineMode(true);
          localStorage.setItem("seaway_offline_mode", "true");
        }
      }
      
      localStorage.setItem("seaway_guest_id", uid);
      localStorage.setItem("seaway_guest_name", displayName);
      localStorage.setItem("seaway_guest_email", email);
      
      // Automatically connect to the dedicated workspace SW-P9VGV1E1NA
      setWorkspaceId("SW-P9VGV1E1NA");
      setWorkspaceName("Melbourne Export Air (MAP) Workspace");
      
      setGuestUser({ uid, displayName, email });
      setSelectedProfile(null);
      setPinInput("");
    } catch (err: any) {
      setPinError("Sign-In Error: " + err.message);
    } finally {
      setSubmittingAuth(false);
    }
  };

  // Monitor Authentication status
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (usr) => {
      setUser(usr);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Listen for real-time Firebase DB connection exceptions
  useEffect(() => {
    const handleErr = (e: any) => {
      setDbError(e.detail || "Unknown Cloud Database error");
    };
    if (typeof window !== "undefined") {
      window.addEventListener("seaway-firebase-error", handleErr);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("seaway-firebase-error", handleErr);
      }
    };
  }, []);

  // Sync workspace parameters to local storage and initialize personal workspace defaults
  useEffect(() => {
    if (currentUser) {
      if (!workspaceId) {
        if (isMAPUser(currentUser)) {
          setWorkspaceId("SW-P9VGV1E1NA");
          setWorkspaceName("Melbourne Export Air (MAP) Workspace");
        } else {
          setWorkspaceId(currentUser.uid);
          if (currentUser.uid.startsWith("guest_")) {
            setWorkspaceName("Guest Workspace");
          } else {
            setWorkspaceName("Personal Workspace");
          }
        }
      }
    }
  }, [currentUser, workspaceId]);

  useEffect(() => {
    if (workspaceId) {
      localStorage.setItem("seaway_workspace_id", workspaceId);
    } else {
      localStorage.removeItem("seaway_workspace_id");
    }
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceName) {
      localStorage.setItem("seaway_workspace_name", workspaceName);
    } else {
      localStorage.removeItem("seaway_workspace_name");
    }
  }, [workspaceName]);

  // Offline/Sandbox Mode initializer and synchronizer
  useEffect(() => {
    if (offlineMode) {
      // Load shipments
      const localShipments = localStorage.getItem(`fallback_shipments_${workspaceId || "sandbox"}`);
      if (localShipments) {
        try {
          setRecords(JSON.parse(localShipments));
        } catch (e) {
          setRecords(SEED_DATA);
        }
      } else {
        setRecords(SEED_DATA);
        localStorage.setItem(`fallback_shipments_${workspaceId || "sandbox"}`, JSON.stringify(SEED_DATA));
      }

      // Load schedules
      const localSchedule = localStorage.getItem(`fallback_schedules_${workspaceId || "sandbox"}`);
      if (localSchedule) {
        try {
          setSchedule(JSON.parse(localSchedule));
        } catch (e) {
          setSchedule(DEFAULT_SCHEDULE);
        }
      } else {
        setSchedule(DEFAULT_SCHEDULE);
        localStorage.setItem(`fallback_schedules_${workspaceId || "sandbox"}`, JSON.stringify(DEFAULT_SCHEDULE));
      }

      // Load work_users
      const localUsers = localStorage.getItem("fallback_work_users");
      if (localUsers) {
        try {
          setWorkUsers(JSON.parse(localUsers));
        } catch (e) {
          setWorkUsers([]);
        }
      } else {
        setWorkUsers([]);
      }
    }
  }, [offlineMode, workspaceId, currentUser]);

  // Monitor real-time user Shipments in Firestore (scoping dynamically to active workspace)
  useEffect(() => {
    if (offlineMode) return;
    if (!currentUser || !workspaceId) {
      setRecords([]);
      return;
    }

    const shipmentsRef = collection(db, "shipments");
    
    // If in Personal Workspace, retrieve user's owned documents (protects backwards compatibility)
    // Otherwise, fetch documents matching the active shared workspace room
    const q = (workspaceId === currentUser.uid)
      ? query(shipmentsRef, where("ownerId", "==", currentUser.uid))
      : query(shipmentsRef, where("workspaceId", "==", workspaceId));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched: Shipment[] = [];
      snapshot.forEach((doc) => {
        fetched.push(doc.data() as Shipment);
      });

      // Sort shipments standard DESC safely
      fetched.sort((a, b) => {
        const idA = a && typeof a.id === "number" ? a.id : 0;
        const idB = b && typeof b.id === "number" ? b.id : 0;
        return idB - idA;
      });

      if (fetched.length === 0 && workspaceId === currentUser.uid) {
        // Automatically seed first-time users ONLY in their Personal Workspace
        seedUserFirestore(currentUser.uid);
      } else {
        setRecords(fetched);
        localStorage.setItem(`fallback_shipments_${workspaceId}`, JSON.stringify(fetched));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "shipments");
      const fallbackStr = localStorage.getItem(`fallback_shipments_${workspaceId}`);
      if (fallbackStr) {
        try {
          setRecords(JSON.parse(fallbackStr));
        } catch (e) {
          setRecords([]);
        }
      } else if (workspaceId === currentUser.uid) {
        setRecords(SEED_DATA);
      }
    });

    return () => unsubscribe();
  }, [currentUser, workspaceId, offlineMode]);

  // Monitor real-time custom flight mapping overrides in Firestore (workspace-scoped)
  useEffect(() => {
    if (offlineMode) return;
    if (!currentUser || !workspaceId) {
      setSchedule(DEFAULT_SCHEDULE);
      return;
    }

    const schedulesRef = collection(db, "schedules");
    const q = (workspaceId === currentUser.uid)
      ? query(schedulesRef, where("ownerId", "==", currentUser.uid))
      : query(schedulesRef, where("workspaceId", "==", workspaceId));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched: FlightSchedule = {};
      snapshot.forEach((doc) => {
        const item = doc.data();
        if (item.flightCode) {
          fetched[item.flightCode] = {
            cutoff: item.cutoff || "",
            dest: item.dest || "",
            cto: item.cto || "",
            etd: item.etd || "",
            eta: item.eta || "",
            airline: item.airline || "",
            days: item.days || "",
          };
        }
      });

      const merged = {
        ...DEFAULT_SCHEDULE,
        ...fetched,
      };
      setSchedule(merged);
      localStorage.setItem(`fallback_schedules_${workspaceId}`, JSON.stringify(merged));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "schedules");
      const fallbackStr = localStorage.getItem(`fallback_schedules_${workspaceId}`);
      if (fallbackStr) {
        try {
          setSchedule(JSON.parse(fallbackStr));
        } catch (e) {
          setSchedule(DEFAULT_SCHEDULE);
        }
      } else {
        setSchedule(DEFAULT_SCHEDULE);
      }
    });

    return () => unsubscribe();
  }, [currentUser, workspaceId, offlineMode]);

  // Monitor real-time corporate work users ledger
  useEffect(() => {
    if (offlineMode) {
      const fallbackStr = localStorage.getItem("fallback_work_users");
      if (fallbackStr) {
        try {
          setWorkUsers(JSON.parse(fallbackStr));
        } catch (e) {
          setWorkUsers([]);
        }
      }
      return;
    }
    
    const workUsersRef = collection(db, "work_users");
    const unsubscribe = onSnapshot(workUsersRef, (snapshot) => {
      const fetched: any[] = [];
      snapshot.forEach((doc) => {
        fetched.push({ id: doc.id, ...doc.data() });
      });
      setWorkUsers(fetched);
      localStorage.setItem("fallback_work_users", JSON.stringify(fetched));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "work_users");
      const fallbackStr = localStorage.getItem("fallback_work_users");
      if (fallbackStr) {
        try {
          setWorkUsers(JSON.parse(fallbackStr));
        } catch (e) {
          setWorkUsers([]);
        }
      }
    });

    return () => unsubscribe();
  }, [offlineMode]);

  // Manual admin/manager action to pre-record a coworker email & passcode
  const handleAdminRegisterUser = async () => {
    const rawEmail = adminAddEmail.trim().toLowerCase();
    const rawPasscode = adminAddPasscode.trim();
    const rawName = adminAddName.trim();

    if (!rawEmail) {
      setAdminAddError("Corporate/Work Email is required.");
      return;
    }
    if (!rawPasscode || rawPasscode.length < 4) {
      setAdminAddError("Passcode must be at least 4 characters.");
      return;
    }
    if (!rawName) {
      setAdminAddError("Staff Display Name is required.");
      return;
    }

    setIsSubmittingAdminUser(true);
    setAdminAddError("");
    setAdminAddSuccess("");

    try {
      const safeDocId = rawEmail.replace(/[@.]/g, "_");
      const userRef = doc(db, "work_users", safeDocId);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        setAdminAddError("A coworker with this email has already been registered.");
        setIsSubmittingAdminUser(false);
        return;
      }

      const newUid = `guest_${safeDocId}_${Math.random().toString(36).substring(2, 6)}`;
      const userData = {
        uid: newUid,
        displayName: rawName,
        email: rawEmail,
        passcode: rawPasscode,
        createdAt: new Date().toISOString(),
      };

      await setDoc(userRef, userData);
      setAdminAddSuccess(`Registered! "${rawName}" can now login with passcode: "${rawPasscode}".`);
      setActiveInviteUser({
        displayName: rawName,
        email: rawEmail,
        passcode: rawPasscode,
      });
      setAdminAddEmail("");
      setAdminAddPasscode("1234");
      setAdminAddName("");
    } catch (err: any) {
      console.error("Admin user registration error: ", err);
      setAdminAddError("Failed to add user: " + err.message);
    } finally {
      setIsSubmittingAdminUser(false);
    }
  };

  // Helper to remove any work user from the passcode ledger
  const handleDeleteWorkUser = async (emailKey: string) => {
    try {
      await deleteDoc(doc(db, "work_users", emailKey));
    } catch (err: any) {
      console.error("Delete coworker error:", err);
      handleFirestoreError(err, OperationType.DELETE, `work_users/${emailKey}`);
    }
  };

  // Seeder helper to auto-populate user cargo log standard template upon their first login
  const seedUserFirestore = async (uid: string) => {
    try {
      const batch = SEED_DATA.map((s) => ({
        ...s,
        ownerId: uid,
        workspaceId: uid,
      }));
      await Promise.all(
        batch.map((shipment) =>
          setDoc(doc(db, "shipments", `${uid}_${shipment.id}`), shipment)
        )
      );
    } catch (err) {
      console.error("Cloud Seeding error:", err);
    }
  };

  // Operations
  const handleAddNewShipment = async (formData: Shipment) => {
    if (!currentUser) return;
    
    // Optimistic local state updates for immediate UI reaction
    let updatedRecords = [...records];
    let newRec: Shipment;
    
    if (editingShipment) {
      const sWorkspaceId = editingShipment.workspaceId || workspaceId;
      newRec = {
        ...formData,
        id: editingShipment.id,
        ownerId: editingShipment.ownerId || currentUser.uid,
        workspaceId: sWorkspaceId,
      };
      updatedRecords = updatedRecords.map(r => r.id === editingShipment.id ? newRec : r);
      setEditingShipment(null);
    } else {
      const nextId = records.length ? Math.max(...records.map((r) => r.id)) + 1 : 1;
      newRec = {
        ...formData,
        id: nextId,
        complete: false,
        ownerId: currentUser.uid,
        workspaceId: workspaceId,
      };
      updatedRecords = [newRec, ...updatedRecords];
    }
    
    updatedRecords.sort((a, b) => b.id - a.id);
    setRecords(updatedRecords);
    localStorage.setItem(`fallback_shipments_${workspaceId}`, JSON.stringify(updatedRecords));
    setActiveTab("manifest");

    if (!offlineMode) {
      try {
        const sWorkspaceId = newRec.workspaceId || workspaceId;
        const docId = `${sWorkspaceId}_${newRec.id}`;
        await setDoc(doc(db, "shipments", docId), newRec);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, "shipments");
      }
    }
  };

  const handleDeleteShipment = async (id: number) => {
    if (!currentUser) return;
    
    // Optimistic local state update
    const updatedRecords = records.filter((r) => r.id !== id);
    setRecords(updatedRecords);
    localStorage.setItem(`fallback_shipments_${workspaceId}`, JSON.stringify(updatedRecords));

    if (!offlineMode) {
      try {
        const matched = records.find((r) => r.id === id);
        const sWorkspaceId = matched?.workspaceId || workspaceId;
        const docId = `${sWorkspaceId}_${id}`;
        await deleteDoc(doc(db, "shipments", docId));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, "shipments");
      }
    }
  };

  const handleUpdateShipment = async (id: number, fields: Partial<Shipment>) => {
    if (!currentUser) return;
    
    // Optimistic local state update
    const updatedRecords = records.map((r) => r.id === id ? { ...r, ...fields } : r);
    setRecords(updatedRecords);
    localStorage.setItem(`fallback_shipments_${workspaceId}`, JSON.stringify(updatedRecords));

    if (!offlineMode) {
      try {
        const matched = records.find((r) => r.id === id);
        if (matched) {
          const sWorkspaceId = matched.workspaceId || workspaceId;
          const docId = `${sWorkspaceId}_${id}`;
          await setDoc(doc(db, "shipments", docId), {
            ...matched,
            ...fields,
            ownerId: matched.ownerId || currentUser.uid,
            workspaceId: sWorkspaceId,
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, "shipments");
      }
    }
  };

  const handleEditShipmentClick = (row: Shipment) => {
    setEditingShipment(row);
    setActiveTab("add");
  };

  const handleToggleComplete = async (id: number) => {
    if (!currentUser) return;
    
    // Optimistic local state update
    const updatedRecords = records.map((r) => r.id === id ? { ...r, complete: !r.complete } : r);
    setRecords(updatedRecords);
    localStorage.setItem(`fallback_shipments_${workspaceId}`, JSON.stringify(updatedRecords));

    if (!offlineMode) {
      try {
        const matched = records.find((r) => r.id === id);
        if (matched) {
          const sWorkspaceId = matched.workspaceId || workspaceId;
          const docId = `${sWorkspaceId}_${id}`;
          await setDoc(doc(db, "shipments", docId), {
            ...matched,
            complete: !matched.complete,
            ownerId: matched.ownerId || currentUser.uid,
            workspaceId: sWorkspaceId,
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, "shipments");
      }
    }
  };

  const handleImportShipments = async (newRows: Omit<Shipment, "id">[]) => {
    if (!currentUser) return;
    
    let maxId = records.length ? Math.max(...records.map((r) => r.id)) : 0;
    const added: Shipment[] = newRows.map((row) => {
      maxId++;
      return {
        ...row,
        id: maxId,
        complete: false,
        ownerId: currentUser.uid,
        workspaceId: workspaceId,
      };
    });
    
    const updatedRecords = [...added, ...records];
    setRecords(updatedRecords);
    localStorage.setItem(`fallback_shipments_${workspaceId}`, JSON.stringify(updatedRecords));

    if (!offlineMode) {
      try {
        const batchWrites = added.map(async (row) => {
          const docId = `${workspaceId}_${row.id}`;
          await setDoc(doc(db, "shipments", docId), row);
        });
        await Promise.all(batchWrites);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, "shipments");
      }
    }
  };

  const handleCustomReset = async () => {
    if (!currentUser) return;
    if (window.confirm("⚠️ This will permanently clear all customized cargo loads and schedules in the current active room. Proceed?")) {
      try {
        setAuthLoading(true);
        
        // Optimistic local update
        if (workspaceId === currentUser.uid) {
          setRecords(SEED_DATA);
          localStorage.setItem(`fallback_shipments_${workspaceId}`, JSON.stringify(SEED_DATA));
          setSchedule(DEFAULT_SCHEDULE);
          localStorage.setItem(`fallback_schedules_${workspaceId}`, JSON.stringify(DEFAULT_SCHEDULE));
        } else {
          setRecords([]);
          localStorage.setItem(`fallback_shipments_${workspaceId}`, JSON.stringify([]));
        }
        
        setEditingShipment(null);
        setActiveTab("manifest");

        if (!offlineMode) {
          // Clean out manifest items from Firestore (only ones that belong to current room)
          const deleteRecords = records.map(async (r) => {
            const sWorkspaceId = r.workspaceId || workspaceId;
            const docId = `${sWorkspaceId}_${r.id}`;
            await deleteDoc(doc(db, "shipments", docId));
          });
          await Promise.all(deleteRecords);

          // Reseed ONLY if it is the Personal Workspace
          if (workspaceId === currentUser.uid) {
            // Clean out custom schedules from Firestore
            const deleteSchedules = Object.keys(schedule).map(async (f) => {
              const docId = `${currentUser.uid}_${f}`;
              await deleteDoc(doc(db, "schedules", docId));
            });
            await Promise.all(deleteSchedules);

            await seedUserFirestore(currentUser.uid);
          }
        }
      } catch (error) {
        console.error("Cloud Database reset failed: ", error);
      } finally {
        setAuthLoading(false);
      }
    }
  };

  const handleScheduleChange = async (updatedSec: FlightSchedule) => {
    setSchedule(updatedSec);
    localStorage.setItem(`fallback_schedules_${workspaceId}`, JSON.stringify(updatedSec));
    
    if (!currentUser) return;
    if (!offlineMode) {
      try {
        for (const [flight, info] of Object.entries(updatedSec)) {
          const def = DEFAULT_SCHEDULE[flight];
          if (
            !def ||
            def.cutoff !== info.cutoff ||
            def.dest !== info.dest ||
            def.cto !== info.cto ||
            def.etd !== info.etd ||
            def.eta !== info.eta ||
            def.airline !== info.airline ||
            def.days !== info.days
          ) {
            const docId = `${workspaceId}_${flight}`;
            await setDoc(doc(db, "schedules", docId), {
              flightCode: flight,
              cutoff: info.cutoff || "",
              dest: info.dest || "",
              cto: info.cto || "",
              etd: info.etd || "",
              eta: info.eta || "",
              airline: info.airline || "",
              days: info.days || "",
              ownerId: currentUser.uid,
              workspaceId: workspaceId,
              updatedAt: new Date().toISOString(),
            });
          }
        }

        for (const flight of Object.keys(schedule)) {
          if (!updatedSec[flight]) {
            const docId = `${workspaceId}_${flight}`;
            await deleteDoc(doc(db, "schedules", docId));
          }
        }
      } catch (error) {
        console.error("Error updating flight mapping inside Firestore: ", error);
      }
    }
  };

  // Selected Date state shared across the app
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());

  // Lifted persistent search states to keep Date Range Search active unless clicked close
  const [searchOpen, setSearchOpen] = useState(true);
  const [searchFrom, setSearchFrom] = useState("");
  const [searchTo, setSearchTo] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searchSelectedIds, setSearchSelectedIds] = useState<Set<number>>(new Set());

  // Stat computations for dashboard widget (PER DAY matching selected date!)
  const dayRecordsForStats = records.filter((r) => r.date === selectedDate);
  const totalLoadsCount = dayRecordsForStats.length;
  const pendingCount = dayRecordsForStats.filter((r) => !r.complete).length;
  const aqisCount = dayRecordsForStats.filter(
    (r) => r.uld && r.uld.toUpperCase().includes("AQIS")
  ).length;
  const activeFlightsCount = Object.keys(schedule).length;

  if (authLoading) {
    return (
      <div 
        style={{ 
          display: "flex", 
          flexDirection: "column", 
          alignItems: "center", 
          justifyContent: "center", 
          height: "100vh", 
          background: "#ffffff", 
          fontFamily: "'Inter', sans-serif" 
        }}
      >
        <div style={{ marginBottom: "20px", display: "flex", justifyContent: "center" }}>
          <SeawayLogo height={38} theme="light" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <RefreshCw style={{ width: "16px", height: "16px", color: "#0284c7", animation: "spin 1.5s linear infinite" }} />
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px" }}>Initializing Cloud Systems...</span>
        </div>
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}} />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "#f1f5f9",
          fontFamily: "'Inter', system-ui, sans-serif",
          padding: "24px",
          overflowY: "auto",
          position: "relative",
        }}
      >
        {(dbError || !offlineMode) && (
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, background: "#fffbeb", color: "#92400e", borderBottom: "1px solid #fde68a", padding: "12px 24px", fontSize: "12.5px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 100, boxSizing: "border-box", gap: "10px" }}>
            <span style={{ fontSize: "12px", textAlign: "left" }}>
              ⚠️ {dbError ? <span><strong>Cloud Sync issue:</strong> {dbError}</span> : <span>Network restrictions or iframe database limits detected.</span>}
              {" "}
              <strong>No worries!</strong> You can bypass this and run 100% locally in Sandbox mode:
            </span>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button 
                onClick={() => {
                  setOfflineMode(true);
                  localStorage.setItem("seaway_offline_mode", "true");
                  setDbError("");
                  // Log in immediately as Melbourne Export Air (MAP)
                  const profile = STATION_PROFILES[0];
                  handleProfileSignIn(profile, "1234", true);
                }} 
                style={{ background: "#d97706", border: "none", color: "#ffffff", padding: "6px 12px", borderRadius: "6px", fontWeight: "bold", cursor: "pointer", fontSize: "11px" }}
              >
                📴 Activate Local Sandbox Mode
              </button>
              <button onClick={() => setDbError("")} style={{ background: "transparent", border: "none", color: "#92400e", fontWeight: "bold", cursor: "pointer", fontSize: "14px" }}>✕</button>
            </div>
          </div>
        )}
        <div
          style={{
            maxWidth: "480px",
            width: "100%",
            background: "#ffffff",
            borderRadius: "24px",
            boxShadow: "0 20px 40px rgba(15, 23, 42, 0.05)",
            border: "1px solid #e2e8f0",
            padding: "40px",
            textAlign: "center",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "24px" }}>
            <SeawayLogo height={42} theme="light" />
            <div style={{ 
              marginTop: "10px", 
              fontSize: "10.5px", 
              fontWeight: 800, 
              color: "#0284c7", 
              textTransform: "uppercase", 
              letterSpacing: "3px" 
            }}>
              Cargo Ops & Dispatch Portal
            </div>
          </div>

          {!selectedProfile ? (
            <div>
              <p style={{ fontSize: "13.5px", color: "#64748b", lineHeight: 1.5, marginBottom: "24px" }}>
                Select your designated station profile to access the cargo manifest and load sheet ledger.
              </p>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", textAlign: "left" }}>
                {getCombinedProfiles().map((profile) => (
                  <button
                    key={profile.email}
                    onClick={() => {
                      setSelectedProfile(profile);
                      setPinInput("");
                      setPinError("");
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "14px",
                      padding: "16px",
                      background: "#ffffff",
                      border: "1px solid #cbd5e1",
                      borderRadius: "16px",
                      cursor: "pointer",
                      textAlign: "left",
                      width: "100%",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#f8fafc";
                      e.currentTarget.style.borderColor = profile.color;
                      e.currentTarget.style.boxShadow = "0 4px 12px rgba(15, 23, 42, 0.03)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#ffffff";
                      e.currentTarget.style.borderColor = "#cbd5e1";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    <div
                      style={{
                        width: "44px",
                        height: "44px",
                        borderRadius: "50%",
                        background: profile.color,
                        color: "#ffffff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        fontSize: "13px",
                        letterSpacing: "0.5px",
                        flexShrink: 0,
                      }}
                    >
                      {profile.initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 750, fontSize: "14px", color: "#1e293b", marginBottom: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {profile.name}
                      </div>
                      <div style={{ fontSize: "11px", color: "#64748b", fontFamily: "monospace" }}>
                        {profile.email}
                      </div>
                    </div>
                    <div style={{ background: "#f1f5f9", padding: "4px 8px", borderRadius: "8px", fontSize: "10px", fontWeight: 700, color: "#475569", flexShrink: 0 }}>
                      PIN Guard
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div
              style={{ cursor: "text" }}
              onClick={() => {
                const el = document.getElementById("pin-keyboard-input");
                if (el) el.focus();
              }}
            >
              {/* Visible numeric/keyboard proxy input */}
              <input
                id="pin-keyboard-input"
                type="text"
                pattern="[0-9]*"
                inputMode="numeric"
                maxLength={4}
                value={pinInput}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^0-9]/g, "").slice(0, 4);
                  setPinInput(cleaned);
                  setPinError("");
                  if (cleaned.length === 4) {
                    setTimeout(() => {
                      handleProfileSignIn(selectedProfile, cleaned);
                    }, 180);
                  }
                }}
                autoFocus
                style={{
                  position: "absolute",
                  opacity: 0,
                  width: "1px",
                  height: "1px",
                  pointerEvents: "none",
                  zIndex: -1,
                }}
              />

              {/* Back button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedProfile(null);
                  setPinInput("");
                  setPinError("");
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#64748b",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  marginBottom: "20px",
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = "#0284c7"}
                onMouseLeave={(e) => e.currentTarget.style.color = "#64748b"}
              >
                ← Back to Profiles
              </button>

              <div
                style={{
                  display: "inline-flex",
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  background: selectedProfile.color,
                  color: "#ffffff",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: "16px",
                  marginBottom: "12px",
                }}
              >
                {selectedProfile.initials}
              </div>

              <h2 style={{ fontSize: "16px", fontWeight: 800, color: "#1e293b", margin: "0 0 4px 0" }}>
                {selectedProfile.name}
              </h2>
              <p style={{ fontSize: "12.5px", color: "#64748b", margin: "0 0 24px 0", fontFamily: "monospace" }}>
                {selectedProfile.email}
              </p>

              {pinError ? (
                <div style={{ color: "#ef4444", fontSize: "12px", fontWeight: 700, marginBottom: "16px" }}>
                  {pinError}
                </div>
              ) : (
                <p style={{ fontSize: "12.5px", color: "#64748b", margin: "0 0 16px 0" }}>
                  Enter your 4-digit Security PIN to sign in.
                </p>
              )}

              {/* PIN Indicator Dots */}
              <div style={{ display: "flex", gap: "16px", justifyContent: "center", margin: "0 0 16px 0" }}>
                {[0, 1, 2, 3].map((idx) => (
                  <div
                    key={idx}
                    style={{
                      width: "16px",
                      height: "16px",
                      borderRadius: "50%",
                      border: `2px solid ${pinError ? "#ef4444" : "#cbd5e1"}`,
                      background: pinInput.length > idx ? (pinError ? "#ef4444" : "#1e293b") : "transparent",
                      transition: "all 0.12s ease",
                      transform: pinInput.length === idx ? "scale(1.15)" : "scale(1)",
                    }}
                  />
                ))}
              </div>

              {/* Helper keyboard hint */}
              <div style={{ fontSize: "11px", color: "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", marginBottom: "24px" }}>
                <span>⌨️</span> Type with your keyboard or dial below
              </div>

              {/* Custom High-Fidelity Numpad */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "14px 20px",
                  justifyItems: "center",
                  maxWidth: "280px",
                  margin: "0 auto",
                }}
              >
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                  <button
                    key={num}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (pinInput.length < 4) {
                        const next = pinInput + num;
                        setPinInput(next);
                        setPinError("");
                        if (next.length === 4) {
                          setTimeout(() => {
                            handleProfileSignIn(selectedProfile, next);
                          }, 180);
                        }
                      }
                    }}
                    style={{
                      width: "56px",
                      height: "56px",
                      borderRadius: "50%",
                      border: "1px solid #cbd5e1",
                      background: "#ffffff",
                      fontSize: "18px",
                      fontWeight: "700",
                      color: "#1e293b",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                      transition: "all 0.1s ease",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.borderColor = "#94a3b8"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "#ffffff"; e.currentTarget.style.borderColor = "#cbd5e1"; }}
                  >
                    {num}
                  </button>
                ))}
                
                {/* Clear Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPinInput("");
                    setPinError("");
                  }}
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "50%",
                    border: "none",
                    background: "transparent",
                    fontSize: "13px",
                    fontWeight: "700",
                    color: "#94a3b8",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.1s ease",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = "#ef4444"}
                  onMouseLeave={(e) => e.currentTarget.style.color = "#94a3b8"}
                >
                  Clear
                </button>

                {/* Number 0 */}
                <button
                  key="0"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (pinInput.length < 4) {
                      const next = pinInput + "0";
                      setPinInput(next);
                      setPinError("");
                      if (next.length === 4) {
                        setTimeout(() => {
                          handleProfileSignIn(selectedProfile, next);
                        }, 180);
                      }
                    }
                  }}
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "50%",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    fontSize: "18px",
                    fontWeight: "700",
                    color: "#1e293b",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                    transition: "all 0.1s ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.borderColor = "#94a3b8"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#ffffff"; e.currentTarget.style.borderColor = "#cbd5e1"; }}
                >
                  0
                </button>

                {/* Backspace Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPinInput(pinInput.slice(0, -1));
                    setPinError("");
                  }}
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "50%",
                    border: "none",
                    background: "transparent",
                    fontSize: "18px",
                    fontWeight: "700",
                    color: "#94a3b8",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.1s ease",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = "#1e293b"}
                  onMouseLeave={(e) => e.currentTarget.style.color = "#94a3b8"}
                >
                  ⌫
                </button>
              </div>

              {submittingAuth && (
                <p style={{ marginTop: "16px", fontSize: "12px", color: "#0284c7", fontWeight: 700, animation: "pulse 1.5s infinite" }}>
                  Authorizing station access...
                </p>
              )}
            </div>
          )}

          {/* Diagnostics Cache and Parameter Eraser */}
          <div style={{ marginTop: "32px", borderTop: "1px solid #e2e8f0", paddingTop: "14px" }}>
            <button
              onClick={() => {
                if (window.confirm("This will log you out, erase your current room memory, clear all browser cache configurations, and restore standard defaults. Correct any sync locks?")) {
                  localStorage.clear();
                  if (window.history && window.history.replaceState) {
                    window.history.replaceState({}, document.title, window.location.pathname);
                  }
                  window.location.reload();
                }
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "#64748b",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer",
                textDecoration: "underline",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px"
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = "#ef4444"}
              onMouseLeave={(e) => e.currentTarget.style.color = "#64748b"}
            >
              🛠️ Registering Issues? Clear Cache & Reset Station
            </button>
          </div>

        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "#f8fafc", // A gorgeous, ultra-sleek light steel background
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        color: "#1e293b", // Premium slate gray
        overflow: "hidden",
        fontSize: "13px",
      }}
    >
      {dbError && !offlineMode && (
        <div style={{ background: "#fffbeb", color: "#92400e", borderBottom: "1px solid #fde68a", padding: "10px 24px", fontSize: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, zIndex: 999, gap: "12px" }}>
          <span>⚠️ <strong>Cloud Database connection issue:</strong> {dbError}. Save locally instead to preserve work:</span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button 
              onClick={() => {
                setOfflineMode(true);
                localStorage.setItem("seaway_offline_mode", "true");
                setDbError("");
              }} 
              style={{ background: "#d97706", border: "none", color: "#ffffff", padding: "4px 10px", borderRadius: "6px", fontWeight: "bold", cursor: "pointer", fontSize: "11px" }}
            >
              📴 Switch to Local Sandbox Mode
            </button>
            <button onClick={() => setDbError("")} style={{ background: "transparent", border: "none", color: "#92400e", fontWeight: "bold", cursor: "pointer", fontSize: "12px" }}>✕</button>
          </div>
        </div>
      )}
      {/* Premium Corporate Navbar */}
      <header
        style={{
          height: "64px",
          background: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.02)",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div 
            style={{ 
              width: "32px", 
              height: "32px", 
              borderRadius: "8px", 
              background: "#f0f9ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid #bae6fd",
            }}
          >
            <Plane style={{ width: "16px", height: "16px", color: "#0284c7" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <SeawayLogo height={22} theme="light" />
            {offlineMode ? (
              <div 
                onClick={() => {
                  const conf = window.confirm("Do you want to reconnect to the Cloud Database? (If Firestore credentials or connection are inactive, synchronizing may generate warnings)");
                  if (conf) {
                    setOfflineMode(false);
                    localStorage.setItem("seaway_offline_mode", "false");
                    window.location.reload();
                  }
                }}
                style={{ 
                  background: "#fef3c7", 
                  border: "1px solid #fde68a", 
                  color: "#b45309", 
                  fontSize: "11px", 
                  fontWeight: 750, 
                  padding: "3px 10px", 
                  borderRadius: "20px", 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "5px", 
                  cursor: "pointer",
                  userSelect: "none"
                }}
                title="Click to reconnect to Cloud Database"
              >
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#b45309" }} />
                📴 Local Sandbox Active
              </div>
            ) : (
              <div 
                onClick={() => {
                  const conf = window.confirm("Switch to 100% Local Sandbox Mode? This bypasses Firestore completely, saving revisions solely in your browser cache to secure offline continuity.");
                  if (conf) {
                    setOfflineMode(true);
                    localStorage.setItem("seaway_offline_mode", "true");
                  }
                }}
                style={{ 
                  background: "#f0fdf4", 
                  border: "1px solid #bbf7d0", 
                  color: "#16a34a", 
                  fontSize: "11px", 
                  fontWeight: 750, 
                  padding: "3px 10px", 
                  borderRadius: "20px", 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "5px", 
                  cursor: "pointer",
                  userSelect: "none"
                }}
                title="Click to activate Local Sandbox Mode"
              >
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#16a34a" }} />
                ☁️ Cloud Synchronized
              </div>
            )}
          </div>
        </div>

        {/* Diagnostic KPIs directly in the main header for seamless tracking */}
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          
          <div style={{ display: "none", alignItems: "center", gap: "20px" }} className="md:flex">
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "10px", color: "#64748b", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.05em" }}>OPERATIONAL STATIONS</div>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a" }}>QFA · SQA · CXA · EK</div>
            </div>
          </div>

          {/* Collaborative Workspace control box */}
          <div 
            onClick={() => setShowWorkspaceModal(true)}
            style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "8px", 
              background: workspaceId === currentUser.uid ? "#f8fafc" : "#f0fdf4", 
              border: workspaceId === currentUser.uid ? "1px solid #cbd5e1" : "1px solid #bbf7d0", 
              padding: "6px 14px", 
              borderRadius: "20px", 
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = workspaceId === currentUser.uid ? "#94a3b8" : "#86efac";
              e.currentTarget.style.background = workspaceId === currentUser.uid ? "#f1f5f9" : "#dcfce7";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = workspaceId === currentUser.uid ? "#cbd5e1" : "#bbf7d0";
              e.currentTarget.style.background = workspaceId === currentUser.uid ? "#f8fafc" : "#f0fdf4";
            }}
            title="Manage Shared Workspaces & Access rooms"
          >
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: workspaceId === currentUser.uid ? "#64748b" : "#16a34a" }} />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: "9px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", lineHeight: "1.1" }}>Workspace</span>
              <span style={{ fontSize: "11px", fontWeight: 850, color: workspaceId === currentUser.uid ? "#334155" : "#15803d", lineHeight: "1.2" }}>
                {workspaceName}
              </span>
            </div>
          </div>

          {/* Elegant authenticated user info */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", borderLeft: "1px solid #e2e8f0", paddingLeft: "20px" }}>
            {(currentUser as any).photoURL ? (
              <img
                src={(currentUser as any).photoURL}
                alt={currentUser.displayName || "User"}
                referrerPolicy="no-referrer"
                style={{ width: "32px", height: "32px", borderRadius: "50%", border: "2px solid #0284c7" }}
              />
            ) : (
              <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#e0f2fe", color: "#0369a1", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "13px" }}>
                {(currentUser.displayName || "U")[0].toUpperCase()}
              </div>
            )}
            <div style={{ display: "none", flexDirection: "column" }} className="sm:flex">
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a", lineHeight: "1.2" }}>{currentUser.displayName || "Operator"}</span>
              <span style={{ fontSize: "10px", color: "#64748b" }}>{currentUser.email}</span>
            </div>
            
            <button
              onClick={async () => {
                if (window.confirm("Are you sure you want to sign out?")) {
                  if (user) {
                    await signOut(auth);
                  }
                  setGuestUser(null);
                  localStorage.removeItem("seaway_guest_id");
                  localStorage.removeItem("seaway_guest_name");
                  localStorage.removeItem("seaway_guest_email");
                  // reset workspace id to trigger auto-recalculation
                  setWorkspaceId("");
                  setWorkspaceName("Personal Workspace");
                }
              }}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "6px",
                borderRadius: "8px",
                color: "#64748b",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#fee2e2";
                e.currentTarget.style.color = "#ef4444";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#64748b";
              }}
              title="Sign Out"
            >
              <LogOut style={{ width: "16px", height: "16px" }} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Corporate Workspace */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
          
          {/* Top Navigation & Operational Hub Bar */}
          <nav
            style={{
              background: "#ffffff",
              borderBottom: "1px solid #e2e8f0",
              display: "flex",
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 24px",
              zIndex: 5,
              gap: "20px",
              flexWrap: "wrap",
            }}
          >
            {/* Nav Links */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              {[
                { 
                  id: "manifest", 
                  label: "Cargo Manifest List", 
                  icon: <Layers style={{ width: "15px", height: "15px" }} />,
                  badge: totalLoadsCount.toString()
                },
                { 
                  id: "search", 
                  label: "Date Range Search", 
                  icon: <Calendar style={{ width: "15px", height: "15px" }} />,
                },
                { 
                  id: "add", 
                  label: editingShipment ? "Edit Selected Shipment" : "Plan New Shipment", 
                  icon: <PlusCircle style={{ width: "15px", height: "15px" }} />,
                },
                { 
                  id: "flights", 
                  label: "Flight Schedule Admin", 
                  icon: <Plane style={{ width: "15px", height: "15px" }} />,
                  badge: activeFlightsCount.toString()
                },
              ].map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (item.id !== "add" && editingShipment) {
                        setEditingShipment(null);
                      }
                      setActiveTab(item.id as any);
                    }}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "20px",
                      border: isActive ? "1px solid #bae6fd" : "1px solid #e2e8f0",
                      background: isActive ? "#f0f9ff" : "#ffffff",
                      color: isActive ? "#0369a1" : "#475569",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      fontSize: "12px",
                      fontWeight: isActive ? 700 : 500,
                      gap: "8px",
                      transition: "all 0.15s ease",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = "#f8fafc";
                        e.currentTarget.style.borderColor = "#cbd5e1";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = "#ffffff";
                        e.currentTarget.style.borderColor = "#e2e8f0";
                      }
                    }}
                  >
                    <div style={{ color: isActive ? "#0284c7" : "#64748b", display: "flex", alignItems: "center" }}>
                      {item.icon}
                    </div>
                    <span>{item.label}</span>
                    {item.badge !== undefined && (
                      <span 
                        style={{ 
                          fontSize: "10px", 
                          fontWeight: 700, 
                          background: isActive ? "#0284c7" : "#64748b", 
                          color: "#ffffff", 
                          padding: "1px 6px", 
                          borderRadius: "10px" 
                        }}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Hub Analytics Summary Panel */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
              {activeTab !== "search" && (
                <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "#f8fafc", borderRadius: "20px", border: "1px solid #e2e8f0", padding: "6px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Clock style={{ width: "13px", height: "13px", color: "#0284c7" }} />
                    <span style={{ fontSize: "11px", fontWeight: 750, color: "#1e293b", textTransform: "uppercase", letterSpacing: "0.03em" }}>Hub Analytics ({toDisplay(selectedDate)}):</span>
                  </div>
                  
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "11px" }}>
                    <div>
                      <span style={{ color: "#64748b" }}>Active Loads:</span>
                      <span style={{ fontWeight: 700, color: "#0f172a", marginLeft: "4px" }}>{totalLoadsCount}</span>
                    </div>
                    <span style={{ color: "#e2e8f0" }}>|</span>
                    <div>
                      <span style={{ color: "#64748b" }}>Pending Checkoffs:</span>
                      <span style={{ fontWeight: 700, color: "#e28743", marginLeft: "4px" }}>{pendingCount}</span>
                    </div>
                    {aqisCount > 0 && (
                      <>
                        <span style={{ color: "#e2e8f0" }}>|</span>
                        <div style={{ display: "flex", alignItems: "center", gap: "4.5px", color: "#b45309" }}>
                          <AlertTriangle style={{ width: "11px", height: "11px" }} />
                          <span style={{ fontWeight: 700 }}>AQIS Holds: {aqisCount}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Cloud Sync active info */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#15803d" }}>
                <Database style={{ width: "12px", height: "12px", color: "#16a34a" }} />
                <span style={{ fontSize: "11.5px", fontWeight: 700 }}>Cloud Sync Active</span>
              </div>
            </div>
          </nav>

          {/* Content Section Panel */}
          <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
            
            {/* Workspace content page */}
            <div style={{ flex: 1, padding: "24px", overflowY: "auto", background: "#f8fafc" }}>
              {activeTab === "manifest" && (
                <ShipmentsTab
                  records={records}
                  schedule={schedule}
                  onEdit={handleEditShipmentClick}
                  onDelete={handleDeleteShipment}
                  onLoadsheet={(r) => {
                    setActiveLoadsheet(r);
                  }}
                  onJobSheet={(r) => {
                    setActiveJobSheet(r);
                  }}
                  onToggleComplete={handleToggleComplete}
                  onImport={handleImportShipments}
                  onUpdate={handleUpdateShipment}
                  selectedDate={selectedDate}
                  onSelectedDateChange={setSelectedDate}
                />
              )}

              {activeTab === "search" && (() => {
                const { dupIds, dupDetails } = buildDuplicateSets(records);
                return (
                  <DateRangeSearch
                    records={records}
                    onEdit={handleEditShipmentClick}
                    onDelete={handleDeleteShipment}
                    onLoadsheet={(r) => setActiveLoadsheet(r)}
                    onJobSheet={(r) => setActiveJobSheet(r)}
                    onToggleComplete={handleToggleComplete}
                    dupIds={dupIds}
                    dupDetails={dupDetails}
                    open={searchOpen}
                    setOpen={setSearchOpen}
                    from={searchFrom}
                    setFrom={setSearchFrom}
                    to={searchTo}
                    setTo={setSearchTo}
                    q={searchQ}
                    setQ={setSearchQ}
                    selectedResultIds={searchSelectedIds}
                    setSelectedResultIds={setSearchSelectedIds}
                    onClosePane={() => {
                      setSearchFrom("");
                      setSearchTo("");
                      setSearchQ("");
                      setSearchSelectedIds(new Set());
                      setActiveTab("manifest");
                    }}
                  />
                );
              })()}

              {activeTab === "add" && (
                <EntryForm
                  initial={editingShipment}
                  schedule={schedule}
                  onCancel={() => {
                    setEditingShipment(null);
                    setActiveTab("manifest");
                  }}
                  onSave={handleAddNewShipment}
                />
              )}

              {activeTab === "flights" && (
                <FlightAdmin
                  schedule={schedule}
                  onChange={handleScheduleChange}
                />
              )}
            </div>
          </main>
        </div>

      {/* Modals viewframes mapping */}
      {activeJobSheet && (
        <JobSheetModal row={activeJobSheet} onClose={() => setActiveJobSheet(null)} />
      )}

      {activeLoadsheet && (
        <LoadsheetModal key={activeLoadsheet.id} row={activeLoadsheet} currentUser={currentUser} offlineMode={offlineMode} onClose={() => setActiveLoadsheet(null)} />
      )}

      <InviteModal
        isOpen={activeInviteUser !== null}
        onClose={() => setActiveInviteUser(null)}
        user={activeInviteUser}
        workspaceId="SW-P9VGV1E1NA"
        workspaceName="Melbourne Export Air (MAP) Workspace"
      />

      {/* Workspace Management Modal */}
      {showWorkspaceModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.4)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            fontFamily: "'Inter', sans-serif",
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              width: "100%",
              maxWidth: "540px",
              maxHeight: "90vh",
              borderRadius: "24px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.15)",
              border: "1px solid #e2e8f0",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Header */}
            <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", padding: "24px", color: "#ffffff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ fontSize: "18px", fontWeight: 800, margin: 0, letterSpacing: "0.5px" }}>LIVE COLLABORATION</h3>
                <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#94a3b8" }}>Coordinate manifest & loadsheets across devices real-time</p>
              </div>
              <button 
                onClick={() => setShowWorkspaceModal(false)}
                style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "20px", fontWeight: "bold" }}
                onMouseEnter={(e) => e.currentTarget.style.color = "#ffffff"}
                onMouseLeave={(e) => e.currentTarget.style.color = "#94a3b8"}
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: "28px", display: "flex", flexDirection: "column", gap: "20px", overflowY: "auto", flex: 1 }}>
              
              {/* Status Indicator */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", background: workspaceId === currentUser.uid ? "#f8fafc" : "#f0fdf4", borderRadius: "16px", padding: "16px", border: workspaceId === currentUser.uid ? "1px solid #e2e8f0" : "1px solid #bbf7d0" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: workspaceId === currentUser.uid ? "#e2e8f0" : "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>
                  {workspaceId === currentUser.uid ? "🔒" : "👥"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Active Room Mode</div>
                  <div style={{ fontSize: "15px", fontWeight: 850, color: workspaceId === currentUser.uid ? "#1e293b" : "#15803d" }}>
                    {workspaceName}
                  </div>
                </div>
                <div style={{ fontSize: "11px", fontStyle: "italic", color: "#64748b" }}>
                  {workspaceId === currentUser.uid ? "Private" : "Company Sync"}
                </div>
              </div>

              {/* Info/How To */}
              <p style={{ fontSize: "13px", color: "#475569", lineHeight: 1.5, margin: 0 }}>
                Workspaces synchronize everything instantly. Office operators, warehouse staff, and flight cutoff supervisors view and update identical cargo lines and checklists on their phones or terminals.
              </p>

              {/* Share workspace code options - Always anchored to SW-P9VGV1E1NA */}
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "16px", padding: "16px", textAlign: "center" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Share Workspace Code to Team</span>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginTop: "8px" }}>
                  <code style={{ fontSize: "20px", fontWeight: 900, background: "#ffffff", padding: "6px 16px", borderRadius: "8px", border: "1px dashed #cbd5e1", color: "#0284c7" }}>
                    SW-P9VGV1E1NA
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText("SW-P9VGV1E1NA");
                      alert("Copied Code to clipboard! Send to your colleagues.");
                    }}
                    style={{ background: "#0f172a", border: "none", color: "#ffffff", padding: "8px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
                  >
                    Copy Code
                  </button>
                </div>
                <p style={{ fontSize: "11px", color: "#64748b", margin: "8px 0 14px 0" }}>
                  Colleagues log in, click 'Switch Workspace' and paste this code to join.
                </p>

                {/* Direct Link Share option to address platform developer sandbox limits */}
                <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "14px", textAlign: "left" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>🚀 Direct Workspace Link (Recommended)</span>
                  <p style={{ fontSize: "11.5px", color: "#475569", margin: "0 0 10px 0", lineHeight: "1.4" }}>
                    Allows colleagues to switch right into this workspace with a single click:
                  </p>
                  <button
                    onClick={() => {
                      const rawOrigin = typeof window !== "undefined" ? window.location.origin : "https://scheduler-app.com";
                      let cleanOrigin = rawOrigin;
                      const directJoinLink = `${cleanOrigin}?workspaceId=SW-P9VGV1E1NA&workspaceName=${encodeURIComponent("Melbourne Export Air (MAP) Workspace")}`;
                      navigator.clipboard.writeText(directJoinLink);
                      alert("Copied custom Direct Workspace Link! Send this link to colleagues.");
                    }}
                    style={{ 
                      width: "100%", 
                      background: "#16a34a", 
                      border: "none", 
                      color: "#ffffff", 
                      padding: "10px", 
                      borderRadius: "8px", 
                      fontSize: "12px", 
                      fontWeight: 700, 
                      cursor: "pointer", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center", 
                      gap: "6px" 
                    }}
                  >
                    🔗 Copy Direct Join Link
                  </button>

                  {/* Email Live Collaboration Option */}
                  <div style={{ marginTop: "12px", border: "1px solid #bae6fd", background: "#f0f9ff", padding: "12px", borderRadius: "10px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 800, color: "#0369a1", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>📧 Email Collaboration Link</span>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        id="collab-invite-email"
                        type="email"
                        placeholder="Teammate's Email Address"
                        style={{ 
                          flex: 1, 
                          padding: "8px 10px", 
                          fontSize: "12px", 
                          border: "1px solid #cbd5e1", 
                          borderRadius: "8px",
                          outline: "none",
                          boxSizing: "border-box"
                        }}
                      />
                      <button
                        onClick={() => {
                          const el = document.getElementById("collab-invite-email") as HTMLInputElement;
                          const email = el ? el.value.trim() : "";
                          const rawOrigin = typeof window !== "undefined" ? window.location.origin : "https://scheduler-app.com";
                          let cleanOrigin = rawOrigin;
                          const directJoinLink = `${cleanOrigin}?workspaceId=SW-P9VGV1E1NA&workspaceName=${encodeURIComponent("Melbourne Export Air (MAP) Workspace")}`;
                          
                          const subject = encodeURIComponent("Action Required: Join Live Cargo Scheduler Workspace - Melbourne Export Air (MAP) Workspace");
                          const body = encodeURIComponent(
                            "Dear Ops Team,\n\nYou have been authorized to join our live cargo operations workspace so we can collaborate on cargo manifests, checklists, loadsheets, and flight schedules in real-time.\n\nPlease click the direct operations link below to join instantly:\n" + directJoinLink + "\n\nWorkspace Name: Melbourne Export Air (MAP) Workspace\nWorkspace ID: SW-P9VGV1E1NA\n\nBest regards,\nOperations Dispatch Team"
                          );
                          
                          window.location.href = `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
                        }}
                        style={{ 
                          background: "#0284c7", 
                          border: "none", 
                          color: "#ffffff", 
                          padding: "8px 14px", 
                          borderRadius: "8px", 
                          fontSize: "12px", 
                          fontWeight: 750, 
                          cursor: "pointer",
                          whiteSpace: "nowrap"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "#0369a1"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "#0284c7"}
                      >
                        Send Email
                      </button>
                    </div>
                  </div>

                  {typeof window !== "undefined" && window.location.origin.includes("ais-dev-") && (
                    <div style={{ fontSize: "10px", color: "#166534", background: "#f0fdf4", padding: "8px 10px", borderRadius: "6px", border: "1px solid #bbf7d0", marginTop: "10px", lineHeight: "1.3" }}>
                      ✅ <strong>Direct Working Link Enabled:</strong> The custom workspace join link has been configured to use your active working URL (<code>ais-dev-...</code>) to ensure colleagues can connect and collaborate seamlessly!
                    </div>
                  )}
                </div>
              </div>

              {/* Change / Config Options */}
              {(isMAPUser(currentUser) ? (workspaceId !== "SW-P9VGV1E1NA") : (workspaceId !== currentUser.uid)) && (
                <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
                  <button
                    onClick={() => {
                      if (isMAPUser(currentUser)) {
                        setWorkspaceId("SW-P9VGV1E1NA");
                        setWorkspaceName("Melbourne Export Air (MAP) Workspace");
                      } else {
                        setWorkspaceId(currentUser.uid);
                        setWorkspaceName(currentUser.uid.startsWith("guest_") ? "Guest Workspace" : "Personal Workspace");
                      }
                      setShowWorkspaceModal(false);
                    }}
                    style={{
                      width: "100%",
                      padding: "12px",
                      borderRadius: "12px",
                      background: "#ffffff",
                      border: "1px solid #cbd5e1",
                      color: "#ef4444",
                      fontWeight: 700,
                      fontSize: "13px",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#fef2f2";
                      e.currentTarget.style.borderColor = "#fca5a5";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#ffffff";
                      e.currentTarget.style.borderColor = "#cbd5e1";
                    }}
                  >
                    {isMAPUser(currentUser)
                      ? "Return to Melbourne Export Air (MAP) Workspace"
                      : "Disconnect Shared Workspace (Return to Private)"}
                  </button>
                </div>
              )}

              {/* Staff Accounts Ledger & Passcodes Manager */}
              <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "14px" }}>🏢</span>
                    <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Staff Passcode Ledger
                    </span>
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: 700, background: "#f1f5f9", color: "#475569", padding: "1px 8px", borderRadius: "10px" }}>
                    {workUsers.length} Active
                  </span>
                </div>

                <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 12px 0", lineHeight: 1.4 }}>
                  This ledger lists registered coworker accounts. Give teammates their listed <strong>Work Email</strong> and <strong>Passcode</strong> so they can log in instantly on their devices.
                </p>

                {/* List of Registered Coworkers */}
                {workUsers.length === 0 ? (
                  <div style={{ border: "1px dashed #cbd5e1", borderRadius: "12px", padding: "16px", textAlign: "center", color: "#64748b", fontSize: "12px", background: "#f8fafc" }}>
                    No corporate team members registered yet. Use the quick form below to add them, or send colleagues the URL to register.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "150px", overflowY: "auto", paddingRight: "4px", marginBottom: "16px" }}>
                    {workUsers.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: "10px",
                          padding: "10px 12px",
                          fontSize: "12px",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0, marginRight: "8px" }}>
                          <div style={{ fontWeight: 750, color: "#1e293b", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                            {item.displayName}
                          </div>
                          <div style={{ color: "#64748b", fontSize: "11px", display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
                            <span>✉️ {item.email}</span>
                            <span>•</span>
                            <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#0284c7" }}>🔑 {item.passcode}</span>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            onClick={() => setActiveInviteUser({
                              displayName: item.displayName,
                              email: item.email,
                              passcode: item.passcode,
                            })}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "#0284c7",
                              cursor: "pointer",
                              fontSize: "11px",
                              fontWeight: 700,
                              padding: "4px 8px",
                              borderRadius: "6px",
                              display: "flex",
                              alignItems: "center",
                              gap: "3px"
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "#f0f9ff"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                          >
                            ✉️ Invite
                          </button>
                          <button
                            onClick={() => handleDeleteWorkUser(item.id)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "#ef4444",
                              cursor: "pointer",
                              fontSize: "11px",
                              fontWeight: 700,
                              padding: "4px 8px",
                              borderRadius: "6px",
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "#fef2f2"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Quick Add Form Section */}
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "14px", marginTop: "12px" }}>
                  <span style={{ fontSize: "11.5px", fontWeight: 800, color: "#475569", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>
                    ➕ Pre-Authorize Team Member/Coworker
                  </span>

                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        type="text"
                        placeholder="Staff Name (e.g. Capt. Carter)"
                        value={adminAddName}
                        onChange={(e) => setAdminAddName(e.target.value)}
                        style={{ flex: 1, padding: "8px 10px", fontSize: "12.5px", border: "1px solid #cbd5e1", borderRadius: "8px", boxSizing: "border-box", background: "#ffffff" }}
                      />
                      <input
                        type="text"
                        disabled
                        value="1234"
                        style={{ width: "120px", padding: "8px 10px", fontSize: "12.5px", border: "1px solid #cbd5e1", borderRadius: "8px", boxSizing: "border-box", background: "#f1f5f9", color: "#475569", fontWeight: "bold", textAlign: "center", cursor: "not-allowed" }}
                        title="Security PIN is fixed to 1234 for streamlined station access."
                      />
                    </div>
                    <input
                      type="email"
                      placeholder="teammate@airline.com (Corporate Email)"
                      value={adminAddEmail}
                      onChange={(e) => setAdminAddEmail(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", fontSize: "12.5px", border: "1px solid #cbd5e1", borderRadius: "8px", boxSizing: "border-box", background: "#ffffff" }}
                    />

                    {adminAddError && (
                      <div style={{ color: "#ef4444", fontSize: "11px", fontWeight: 650, marginTop: "2px" }}>
                        ⚠️ {adminAddError}
                      </div>
                    )}

                    {adminAddSuccess && (
                      <div style={{ color: "#16a34a", fontSize: "11px", fontWeight: 650, marginTop: "2px" }}>
                        ✓ {adminAddSuccess}
                      </div>
                    )}

                    <button
                      onClick={handleAdminRegisterUser}
                      disabled={isSubmittingAdminUser}
                      style={{
                        width: "100%",
                        padding: "9px",
                        background: "#0284c7",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: "pointer",
                        opacity: isSubmittingAdminUser ? 0.7 : 1,
                        transition: "all 0.15s",
                        marginTop: "4px",
                      }}
                      onMouseEnter={(e) => { if (!isSubmittingAdminUser) e.currentTarget.style.background = "#0369a1"; }}
                      onMouseLeave={(e) => { if (!isSubmittingAdminUser) e.currentTarget.style.background = "#0284c7"; }}
                    >
                      {isSubmittingAdminUser ? "Registering..." : "Add to Passcode Ledger"}
                    </button>
                  </div>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* Mini clean status rail representing system state */}
      <footer
        style={{
          height: "28px",
          background: "#0c4a6e", // Deep Seaway corporate blue
          color: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          fontSize: "11px",
          fontWeight: 500,
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4ade80", display: "inline-block" }}></span>
            <span>Cargo Scheduler Engine Online</span>
          </div>
          <span style={{ opacity: 0.4 }}>|</span>
          <div>
            <span>Checked: {records.filter(r => r.complete).length}</span> / <span style={{ opacity: 0.7 }}>{records.length} items</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span>System Standard: UTC-10 / UTC-11</span>
          <span style={{ opacity: 0.4 }}>|</span>
          <span>Australia/Melbourne</span>
        </div>
      </footer>
    </div>
  );
}
