/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
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
  Mail,
  Globe,
  BookOpen
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
import { CargoTemplatesSettingsAdmin } from "./components/CargoTemplatesSettingsAdmin";
import { InviteModal } from "./components/InviteModal";
import { SeawayLogo } from "./components/SeawayLogo";
import { subtractHour, todayStr, toDisplay } from "./utils/helpers";
import { doc, getDoc, setDoc, deleteDoc, updateDoc, collection, onSnapshot, query, where, writeBatch } from "firebase/firestore";
import { onAuthStateChanged, signInWithPopup, signOut, User } from "firebase/auth";
import { auth, db, googleProvider, OperationType, handleFirestoreError } from "./lib/firebase";

const STATION_PROFILES = [
  {
    name: "Moe Khalil",
    email: "moeykhalil0@gmail.com",
    code: "SW-P9VGV1E1NA",
    color: "#0f172a", // Slate
    initials: "MK",
  }
];

const ALL_STATIONS = [
  { value: "MEL", label: "MEL (Melbourne)" },
  { value: "SYD", label: "SYD (Sydney)" },
  { value: "BNE", label: "BNE (Brisbane)" },
  { value: "CNS", label: "CNS (Cairns)" },
  { value: "PER", label: "PER (Perth)" },
  { value: "ADL", label: "ADL (Adelaide)" },
];

export default function App() {
  // Firebase Auth states
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Passcode-based Direct Workspace Access State (coworkers bypass Google login)
  const [guestUser, setGuestUser] = useState<{ uid: string; displayName: string; email: string; role?: string; station?: string } | null>(() => {
    const savedId = localStorage.getItem("seaway_guest_id");
    const savedName = localStorage.getItem("seaway_guest_name");
    const savedEmail = localStorage.getItem("seaway_guest_email");
    const savedRole = localStorage.getItem("seaway_guest_role");
    const savedStation = localStorage.getItem("seaway_guest_station");
    if (savedId && savedName) {
      return { 
        uid: savedId, 
        displayName: savedName, 
        email: savedEmail || "guest@seaway.com",
        role: savedRole || "Admin User",
        station: savedStation || "MEL"
      };
    }
    return null;
  });

  const currentUser = user || guestUser;

  const [selectedPort, setSelectedPort] = useState<string>(() => {
    return localStorage.getItem("seaway_active_port") || "MEL";
  });

  const [selectedProfile, setSelectedProfile] = useState<{ name: string; email: string; code: string; color: string; initials: string } | null>(null);
  const [pinInput, setPinInput] = useState<string>("");
  const [pinError, setPinError] = useState<string>("");
  const [submittingAuth, setSubmittingAuth] = useState(false);
  const [authError, setAuthError] = useState("");

  // Dynamic login credentials inputs state
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginStation, setLoginStation] = useState("MEL");

  // Passcode reset state
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetStation, setResetStation] = useState("MEL");
  const [resetName, setResetName] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");
  const [isSubmittingReset, setIsSubmittingReset] = useState(false);
  const [copiedShareCode, setCopiedShareCode] = useState(false);
  const [copiedDirectLink, setCopiedDirectLink] = useState(false);

  // In-App Staff Accounts/Passcode Ledger States
  const [workUsers, setWorkUsers] = useState<any[]>([]);
  const [adminAddName, setAdminAddName] = useState("");
  const [adminAddEmail, setAdminAddEmail] = useState("");
  const [adminAddPasscode, setAdminAddPasscode] = useState("1234");
  const [adminAddError, setAdminAddError] = useState("");
  const [adminAddSuccess, setAdminAddSuccess] = useState("");
  const [isSubmittingAdminUser, setIsSubmittingAdminUser] = useState(false);
  const [activeInviteUser, setActiveInviteUser] = useState<{ displayName: string; email: string; passcode: string; station?: string } | null>(null);
  const [adminAddStation, setAdminAddStation] = useState("MEL");
  const [adminAddRole, setAdminAddRole] = useState("Standard user");
  const [editingAccount, setEditingAccount] = useState<any | null>(null);
  const [passwordResetTarget, setPasswordResetTarget] = useState<any | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState("");

  // States synchronized from Cloud Storage
  const [records, setRecords] = useState<Shipment[]>([]);
  const recentlyDeletedIds = useRef<Set<number>>(new Set());
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
  const [quotaExceeded, setQuotaExceeded] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("seaway_quota_exceeded") === "true";
    }
    return false;
  });
  const [offlineMode, setOfflineMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("seaway_quota_exceeded") === "true" || localStorage.getItem("seaway_offline_mode") === "true";
    }
    return false;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("seaway_quota_exceeded", quotaExceeded ? "true" : "false");
      if (quotaExceeded) {
        setOfflineMode(true);
      }
    }
  }, [quotaExceeded]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("seaway_offline_mode", offlineMode ? "true" : "false");
    }
  }, [offlineMode]);

  const [activeTab, setActiveTab] = useState<"manifest" | "search" | "add" | "flights" | "settings">("manifest");
  const [settingsSubTab, setSettingsSubTab] = useState<"setup" | "info" | "templates" | "flights">("setup");
  const [editingShipment, setEditingShipment] = useState<Shipment | null>(null);
  const [highlightFlight, setHighlightFlight] = useState<string | null>(null);

  const handleGoToFlightSchedule = (flightCode: string) => {
    if (!flightCode) return;
    setHighlightFlight(flightCode);
    setActiveTab("settings");
    setSettingsSubTab("flights");
  };
  const [sandboxAdminOverride, setSandboxAdminOverride] = useState(false);

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
           email === "moeykhalil0@gmail.com" ||
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
    setSubmittingAuth(true);
    setPinError("");
    
    // Standard logins automatically cloud-synchronize by setting offline mode to false
    const shouldBeOffline = remainsOffline || quotaExceeded;
    if (!shouldBeOffline) {
      setOfflineMode(false);
    }
    
    try {
      const email = profile.email;
      const safeDocId = email.replace(/[@.]/g, "_");
      
      let uid = `guest_${safeDocId}_seaway_local`;
      let displayName = profile.name;
      let dbPasscode = "1234"; // Default passcode
      let dbRole = "Admin User"; // Builtins default to Admin User
      let dbStation = "MEL";
      
      if (!shouldBeOffline) {
        try {
          const userRef = doc(db, "work_users", safeDocId);
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            // Create default user entry if signature is one of the initial presets
            await setDoc(userRef, {
              uid,
              displayName,
              email,
              passcode: "1234",
              station: "MEL",
              role: "Admin User",
              createdAt: new Date().toISOString(),
            });
          } else {
            const data = userSnap.data();
            uid = data.uid || uid;
            displayName = data.displayName || displayName;
            dbPasscode = data.passcode || "1234";
            dbRole = data.role || "Standard user";
            dbStation = data.station || "MEL";
          }
        } catch (dbErr) {
          console.warn("Database failed to load profile, bypassing to local mode:", dbErr);
          // Look inside local workUsers array as fallback
          const localUser = workUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
          if (localUser) {
            dbPasscode = localUser.passcode || "1234";
            displayName = localUser.displayName || displayName;
            uid = localUser.uid || uid;
            dbRole = localUser.role || "Standard user";
            dbStation = localUser.station || "MEL";
          }
        }
      } else {
        // Look inside local workUsers array as fallback
        const localUser = workUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
        if (localUser) {
          dbPasscode = localUser.passcode || "1234";
          displayName = localUser.displayName || displayName;
          uid = localUser.uid || uid;
          dbRole = localUser.role || "Standard user";
          dbStation = localUser.station || "MEL";
        }
      }

      // Validate the pin/password
      if (pin !== dbPasscode) {
        setPinError("❌ Invalid password or passcode. Please try again.");
        setSubmittingAuth(false);
        return;
      }
      
      localStorage.setItem("seaway_guest_id", uid);
      localStorage.setItem("seaway_guest_name", displayName);
      localStorage.setItem("seaway_guest_email", email);
      localStorage.setItem("seaway_guest_role", dbRole);
      localStorage.setItem("seaway_guest_station", dbStation);
      
      // Automatically connect to the dedicated workspace SW-P9VGV1E1NA
      setWorkspaceId("SW-P9VGV1E1NA");
      setWorkspaceName("Melbourne Export Air (MAP) Workspace");
      
      setGuestUser({ uid, displayName, email, role: dbRole, station: dbStation });
      setSelectedProfile(null);
      setPinInput("");
    } catch (err: any) {
      setPinError("Sign-In Error: " + err.message);
    } finally {
      setSubmittingAuth(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim()) {
      setPinError("⚠️ Please enter your User name or Email.");
      return;
    }
    if (!loginPassword.trim()) {
      setPinError("⚠️ Please enter your Password.");
      return;
    }
    
    setSubmittingAuth(true);
    setPinError("");
    
    const uName = loginUsername.trim().toLowerCase();
    const uPass = loginPassword.trim();
    
    // Check built-ins first
    let matchedProfile: any = null;
    const foundBuiltIn = STATION_PROFILES.find(p => 
      p.email.toLowerCase() === uName || 
      p.name.toLowerCase() === uName ||
      p.initials.toLowerCase() === uName
    );
    
    if (foundBuiltIn) {
      matchedProfile = {
        name: foundBuiltIn.name,
        email: foundBuiltIn.email,
        role: "Admin User",
        station: loginStation,
        passcode: "1234",
      };
    } else {
      // Check Firestore dynamic workUsers
      const foundDynamic = workUsers.find(u => 
        u.email.toLowerCase() === uName || 
        uName === (u.displayName || "").toLowerCase()
      );
      if (foundDynamic) {
        matchedProfile = {
          name: foundDynamic.displayName,
          email: foundDynamic.email,
          role: foundDynamic.role || "Standard user",
          station: foundDynamic.station || loginStation,
          passcode: foundDynamic.passcode,
        };
      }
    }
    
    if (!matchedProfile) {
      setPinError("❌ No administration account found with that User name.");
      setSubmittingAuth(false);
      return;
    }
    
    if (uPass !== matchedProfile.passcode) {
      setPinError("❌ Incorrect password. Please try again.");
      setSubmittingAuth(false);
      return;
    }
    
    // Successfully found & verified
    try {
      const docId = `guest_${matchedProfile.email.replace(/[@.]/g, "_")}_seaway_local`;
      localStorage.setItem("seaway_guest_id", docId);
      localStorage.setItem("seaway_guest_name", matchedProfile.name);
      localStorage.setItem("seaway_guest_email", matchedProfile.email);
      localStorage.setItem("seaway_guest_role", matchedProfile.role);
      localStorage.setItem("seaway_guest_station", matchedProfile.station);
      
      setWorkspaceId("SW-P9VGV1E1NA");
      setWorkspaceName("Melbourne Export Air (MAP) Workspace");
      if (!quotaExceeded) {
        setOfflineMode(false);
      }
      
      setGuestUser({ 
        uid: docId, 
        displayName: matchedProfile.name, 
        email: matchedProfile.email, 
        role: matchedProfile.role, 
        station: matchedProfile.station 
      });
      
      setPinInput("");
      setPinError("");
    } catch (err: any) {
      setPinError("Sign-In Error: " + err.message);
    } finally {
      setSubmittingAuth(false);
    }
  };

  const handlePasswordResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError("");
    setResetSuccess("");
    
    const emailLower = resetEmail.trim().toLowerCase();
    const nameLower = resetName.trim().toLowerCase();
    const newPass = resetNewPassword.trim();
    
    if (!emailLower || !nameLower || !newPass) {
      setResetError("⚠️ Please populate all fields to verify your dispatch account.");
      return;
    }
    
    // Check built-ins first
    const isBuiltIn = STATION_PROFILES.some(p => p.email.toLowerCase() === emailLower);
    if (isBuiltIn) {
      setResetError("❌ Built-in station accounts cannot be modified via self-reset. Please register a unique dispatcher profile or use standard password '1234'.");
      return;
    }
    
    // Look up in dynamic workUsers
    const safeDocId = emailLower.replace(/[@.]/g, "_");
    const matchedUser = workUsers.find(u => u.email.toLowerCase() === emailLower);
    
    if (!matchedUser) {
      setResetError("❌ No registered administration account found with that Email Address.");
      return;
    }
    
    if (matchedUser.displayName.toLowerCase() !== nameLower) {
      setResetError("❌ Staff name does not match the registered user record for this email.");
      return;
    }
    
    setIsSubmittingReset(true);
    try {
      const updatedLocalUsers = workUsers.map(u => 
        u.email.toLowerCase() === emailLower ? { ...u, passcode: newPass } : u
      );
      setWorkUsers(updatedLocalUsers);
      localStorage.setItem("fallback_work_users", JSON.stringify(updatedLocalUsers));

      if (!offlineMode) {
        // Update in Firestore
        const userRef = doc(db, "work_users", safeDocId);
        await updateDoc(userRef, {
          passcode: newPass
        });
      }
      setResetSuccess("✓ Password updated successfully! You can now back out and sign in with your new password.");
      
      // Clear inputs
      setResetEmail("");
      setResetName("");
      setResetNewPassword("");
    } catch (err: any) {
      setResetError("Database action failing: " + err.message);
    } finally {
      setIsSubmittingReset(false);
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
      const errMsg = e.detail || "Unknown Cloud Database error";
      setDbError(errMsg);
      if (
        errMsg.toLowerCase().includes("quota") ||
        errMsg.toLowerCase().includes("exhausted") ||
        errMsg.toLowerCase().includes("billing")
      ) {
        setQuotaExceeded(true);
        setOfflineMode(true);
      }
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
      const localSchedule = localStorage.getItem(`fallback_schedules_${workspaceId || "sandbox"}_${selectedPort}`);
      if (localSchedule) {
        try {
          setSchedule(JSON.parse(localSchedule));
        } catch (e) {
          setSchedule(selectedPort === "MEL" ? DEFAULT_SCHEDULE : {});
        }
      } else {
        const fallSched = selectedPort === "MEL" ? DEFAULT_SCHEDULE : {};
        setSchedule(fallSched);
        localStorage.setItem(`fallback_schedules_${workspaceId || "sandbox"}_${selectedPort}`, JSON.stringify(fallSched));
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
  }, [offlineMode, workspaceId, currentUser, selectedPort]);

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
        const item = doc.data() as Shipment;
        if (!item.isDeleted && !recentlyDeletedIds.current.has(Number(item.id))) {
          fetched.push(item);
        }
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

  // Monitor real-time custom flight mapping overrides in Firestore (workspace-scoped, partitioned by port)
  useEffect(() => {
    if (offlineMode) return;
    if (!currentUser || !workspaceId) {
      setSchedule(selectedPort === "MEL" ? DEFAULT_SCHEDULE : {});
      return;
    }

    const schedulesRef = collection(db, "schedules");
    const q = (workspaceId === currentUser.uid)
      ? query(schedulesRef, where("ownerId", "==", currentUser.uid))
      : query(schedulesRef, where("workspaceId", "==", workspaceId));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched: FlightSchedule = {};
      const deletedFlights = new Set<string>();
      snapshot.forEach((doc) => {
        const item = doc.data();
        if (item.flightCode && (item.station === selectedPort || (!item.station && selectedPort === "MEL"))) {
          if (item.isDeleted) {
            deletedFlights.add(item.flightCode);
          } else {
            fetched[item.flightCode] = {
              cutoff: item.cutoff || "",
              dest: item.dest || "",
              cto: item.cto || "",
              etd: item.etd || "",
              eta: item.eta || "",
              airline: item.airline || "",
              days: item.days || "",
              emailContacts: item.emailContacts || "",
              contactPhone: item.contactPhone || "",
              bookingPortal: item.bookingPortal || "",
              bookingNotes: item.bookingNotes || "",
            };
          }
        }
      });

      const baseSchedule = selectedPort === "MEL" ? { ...DEFAULT_SCHEDULE } : {};
      deletedFlights.forEach((f) => {
        delete baseSchedule[f];
      });

      const merged = {
        ...baseSchedule,
        ...fetched,
      };
      setSchedule(merged);
      localStorage.setItem(`fallback_schedules_${workspaceId}_${selectedPort}`, JSON.stringify(merged));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "schedules");
      const fallbackStr = localStorage.getItem(`fallback_schedules_${workspaceId}_${selectedPort}`);
      if (fallbackStr) {
        try {
          setSchedule(JSON.parse(fallbackStr));
        } catch (e) {
          setSchedule(selectedPort === "MEL" ? DEFAULT_SCHEDULE : {});
        }
      } else {
        setSchedule(selectedPort === "MEL" ? DEFAULT_SCHEDULE : {});
      }
    });

    return () => unsubscribe();
  }, [currentUser, workspaceId, offlineMode, selectedPort]);

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

  // Manual admin/manager action to pre-record a coworker email & password
  const handleAdminRegisterUser = async () => {
    if (!isUserAdminCurrent()) {
      setAdminAddError("Unauthorized: Only administrator accounts can create users.");
      return;
    }
    const rawEmail = adminAddEmail.trim().toLowerCase();
    const rawPasscode = adminAddPasscode.trim();
    const rawName = adminAddName.trim();

    if (!rawEmail) {
      setAdminAddError("Email Address is required.");
      return;
    }
    if (!rawPasscode || rawPasscode.length < 4) {
      setAdminAddError("Password must be at least 4 characters.");
      return;
    }
    if (!rawName) {
      setAdminAddError("Staff name is required.");
      return;
    }

    setIsSubmittingAdminUser(true);
    setAdminAddError("");
    setAdminAddSuccess("");

    try {
      const safeDocId = rawEmail.replace(/[@.]/g, "_");
      const userExistsLocally = workUsers.some(u => u.email.toLowerCase() === rawEmail);

      if (offlineMode) {
        if (userExistsLocally) {
          setAdminAddError("An account with this email has already been registered.");
          setIsSubmittingAdminUser(false);
          return;
        }
      } else {
        const userRef = doc(db, "work_users", safeDocId);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          setAdminAddError("An account with this email has already been registered.");
          setIsSubmittingAdminUser(false);
          return;
        }
      }

      const newUid = `guest_${safeDocId}_${Math.random().toString(36).substring(2, 6)}`;
      const userData = {
        uid: newUid,
        displayName: rawName,
        email: rawEmail,
        passcode: rawPasscode,
        station: adminAddStation.trim() || "MEL",
        role: adminAddRole || "Standard user",
        createdAt: new Date().toISOString(),
      };

      const updatedLocalUsers = [...workUsers, { id: safeDocId, ...userData }];
      setWorkUsers(updatedLocalUsers);
      localStorage.setItem("fallback_work_users", JSON.stringify(updatedLocalUsers));

      if (!offlineMode) {
        const userRef = doc(db, "work_users", safeDocId);
        await setDoc(userRef, userData);
      }
      
      setAdminAddSuccess(`Registered! "${rawName}" can now login with password/passcode: "${rawPasscode}".`);
      setActiveInviteUser({
        displayName: rawName,
        email: rawEmail,
        passcode: rawPasscode,
      });
      setAdminAddEmail("");
      setAdminAddPasscode("1234");
      setAdminAddName("");
      setAdminAddStation("MEL");
      setAdminAddRole("Standard user");
    } catch (err: any) {
      console.error("Admin user registration error: ", err);
      setAdminAddError("Failed to add user: " + err.message);
    } finally {
      setIsSubmittingAdminUser(false);
    }
  };

  const isUserAdminCurrent = () => {
    if (!currentUser) return false;
    const emailLower = currentUser.email?.toLowerCase();
    
    // Explicitly grant full admin override privilege to primary workspace developer and owner
    if (emailLower === "moeykhalil0@gmail.com") return true;

    const isBuiltIn = STATION_PROFILES.some(p => p.email.toLowerCase() === emailLower);
    if (isBuiltIn) return true;

    // Check dynamic registered coworker/teammate profiles
    const matched = workUsers.find(u => u.email.toLowerCase() === emailLower);
    if (matched && matched.role === "Admin User") return true;

    return (currentUser as any).role === "Admin User";
  };

  // Synchronize active / selected port context
  useEffect(() => {
    if (currentUser) {
      const userStation = (currentUser as any).station || "MEL";
      const isAdmin = isUserAdminCurrent();
      if (!isAdmin) {
        setSelectedPort(userStation);
        localStorage.setItem("seaway_active_port", userStation);
      } else {
        const saved = localStorage.getItem("seaway_active_port");
        if (saved) {
          setSelectedPort(saved);
        } else {
          setSelectedPort(userStation);
          localStorage.setItem("seaway_active_port", userStation);
        }
      }
    }
  }, [currentUser, workUsers]);

  const isTabAllowed = (tabId: string) => {
    if (!currentUser) return false;
    
    const emailLower = currentUser.email?.toLowerCase();
    
    // Built-in station profiles are always full Admin User
    const isBuiltIn = STATION_PROFILES.some(p => p.email.toLowerCase() === emailLower);
    if (isBuiltIn) return true;
    
    // If the role is specifically Admin User, allow all tabs
    if ((currentUser as any).role === "Admin User") return true;
    
    // Look up within the dynamic users
    const matched = workUsers.find(u => u.email.toLowerCase() === emailLower);
    if (!matched) {
      return true; // Default to allowing if they are some other unknown system user or google user
    }
    
    // Check custom list of allowed tabs
    if (!matched.allowedTabs) {
      return true; // Default to allow so we don't lock existing users out
    }
    
    return matched.allowedTabs.includes(tabId);
  };

  // Redirect users if they are currently on a disallowed tab
  useEffect(() => {
    if (currentUser && !isTabAllowed(activeTab)) {
      const tabs = ["manifest", "search", "add", "flights", "settings"];
      const firstAllowed = tabs.find(t => isTabAllowed(t));
      if (firstAllowed) {
        setActiveTab(firstAllowed as any);
      }
    }
  }, [currentUser, activeTab, workUsers]);

  const toggleUserTabAccess = async (userAccount: any, tabId: string) => {
    if (!isUserAdminCurrent()) {
      alert("Unauthorized: Only administrator accounts can modify tab access permissions.");
      return;
    }

    const currentAllowed = userAccount.allowedTabs || ["manifest", "search", "add", "flights", "settings"];
    let newAllowed: string[];
    if (currentAllowed.includes(tabId)) {
      newAllowed = currentAllowed.filter((t: string) => t !== tabId);
    } else {
      newAllowed = [...currentAllowed, tabId];
    }

    if (offlineMode) {
      const updatedWorkUsers = workUsers.map(u => {
        if (u.id === userAccount.id) {
          return { ...u, allowedTabs: newAllowed };
        }
        return u;
      });
      setWorkUsers(updatedWorkUsers);
      localStorage.setItem("fallback_work_users", JSON.stringify(updatedWorkUsers));
      return;
    }

    try {
      const safeDocId = userAccount.email.replace(/[@.]/g, "_");
      const userRef = doc(db, "work_users", safeDocId);
      await setDoc(userRef, { allowedTabs: newAllowed }, { merge: true });
    } catch (err: any) {
      console.error("Error toggling tab access: ", err);
      alert("Failed to update tab permissions: " + err.message);
    }
  };

  const handleEditAccountClick = (userAccount: any) => {
    if (!isUserAdminCurrent()) {
      alert("Unauthorized: Only administrator accounts can edit workstation profiles.");
      return;
    }
    setSettingsSubTab("setup");
    setEditingAccount(userAccount);
    setAdminAddName(userAccount.displayName || "");
    setAdminAddEmail(userAccount.email || "");
    setAdminAddPasscode(userAccount.passcode || "");
    setAdminAddStation(userAccount.station || "MEL");
    setAdminAddRole(userAccount.role || "Standard user");
    setAdminAddError("");
    setAdminAddSuccess("");
  };

  const handleCancelEditAccount = () => {
    setEditingAccount(null);
    setAdminAddName("");
    setAdminAddEmail("");
    setAdminAddPasscode("1234");
    setAdminAddStation("MEL");
    setAdminAddRole("Standard user");
    setAdminAddError("");
    setAdminAddSuccess("");
  };

  const handleUpdateAdminUser = async () => {
    if (!isUserAdminCurrent()) {
      setAdminAddError("Unauthorized: Only administrator accounts can update users.");
      return;
    }
    if (!editingAccount) return;
    const rawEmail = adminAddEmail.trim().toLowerCase();
    const rawPasscode = adminAddPasscode.trim();
    const rawName = adminAddName.trim();

    if (!rawEmail) {
      setAdminAddError("Email Address is required.");
      return;
    }
    if (!rawPasscode || rawPasscode.length < 4) {
      setAdminAddError("Password must be at least 4 characters.");
      return;
    }
    if (!rawName) {
      setAdminAddError("Staff name is required.");
      return;
    }

    setIsSubmittingAdminUser(true);
    setAdminAddError("");
    setAdminAddSuccess("");

    try {
      const safeDocId = rawEmail.replace(/[@.]/g, "_");
      const updateData = {
        displayName: rawName,
        email: rawEmail,
        passcode: rawPasscode,
        station: adminAddStation.trim() || "MEL",
        role: adminAddRole || "Standard user",
        updatedAt: new Date().toISOString(),
      };

      const updatedLocalUsers = workUsers.map(u => 
        u.email.toLowerCase() === rawEmail ? { ...u, ...updateData } : u
      );
      setWorkUsers(updatedLocalUsers);
      localStorage.setItem("fallback_work_users", JSON.stringify(updatedLocalUsers));

      if (!offlineMode) {
        const userRef = doc(db, "work_users", safeDocId);
        await setDoc(userRef, updateData, { merge: true });
      }

      // If updating ourselves, also sync current workstation role/station context
      if (currentUser && currentUser.email.toLowerCase() === rawEmail) {
        localStorage.setItem("seaway_guest_name", rawName);
        localStorage.setItem("seaway_guest_role", adminAddRole);
        localStorage.setItem("seaway_guest_station", adminAddStation);
        setGuestUser(prev => prev ? { ...prev, displayName: rawName, role: adminAddRole, station: adminAddStation } : null);
      }

      setAdminAddSuccess(`Successfully updated "${rawName}" account!`);
      handleCancelEditAccount();
    } catch (err: any) {
      console.error("Admin user update error:", err);
      setAdminAddError("Failed to update user: " + err.message);
    } finally {
      setIsSubmittingAdminUser(false);
    }
  };

  const initiatePasswordReset = (userAccount: any) => {
    setPasswordResetTarget(userAccount);
    setNewPasswordValue(userAccount.passcode || "");
  };

  const handleCommitPasswordChange = async (targetUser: any, newPass: string) => {
    const cleanPass = newPass.trim();
    if (cleanPass.length < 4) {
      alert("Password must be at least 4 characters.");
      return;
    }
    const currentEmail = currentUser?.email?.toLowerCase();
    const targetEmail = targetUser.email.toLowerCase();
    const isAdmin = isUserAdminCurrent();
    const isSelf = currentEmail === targetEmail;

    if (!isAdmin && !isSelf) {
      alert("Unauthorized: You do not have permissions to reset this password.");
      return;
    }

    try {
      const safeDocId = targetUser.email.replace(/[@.]/g, "_");
      
      const updatedLocalUsers = workUsers.map(u => 
        u.email.toLowerCase() === targetEmail ? { ...u, passcode: cleanPass } : u
      );
      setWorkUsers(updatedLocalUsers);
      localStorage.setItem("fallback_work_users", JSON.stringify(updatedLocalUsers));

      if (!offlineMode) {
        const userRef = doc(db, "work_users", safeDocId);
        await setDoc(userRef, { passcode: cleanPass }, { merge: true });
      }
      
      // Update guestUser states locally
      if (guestUser && guestUser.email.toLowerCase() === targetEmail) {
        setGuestUser(prev => prev ? { ...prev, passcode: cleanPass } : null);
      }
      
      alert(`Success: Password for "${targetUser.displayName || targetUser.name || 'Account'}" has been updated to "${cleanPass}" successfully!`);
      setPasswordResetTarget(null);
      setNewPasswordValue("");
    } catch (err: any) {
      alert(`Error updating password: ${err.message}`);
    }
  };

  // Helper to remove any work user from the passcode ledger
  const handleDeleteWorkUser = async (emailKey: string) => {
    if (!isUserAdminCurrent()) {
      alert("Unauthorized: Only administrator accounts can delete users.");
      return;
    }
    const confirmDelete = window.confirm("Are you sure you want to delete this administration account?");
    if (!confirmDelete) return;
    try {
      const updatedLocalUsers = workUsers.filter(u => u.id !== emailKey);
      setWorkUsers(updatedLocalUsers);
      localStorage.setItem("fallback_work_users", JSON.stringify(updatedLocalUsers));

      if (!offlineMode) {
        await deleteDoc(doc(db, "work_users", emailKey));
      }
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
        station: editingShipment.station || selectedPort,
        confirmDelete: false,
        deleteSured: false,
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
        station: selectedPort,
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
    
    const numericId = Number(id);
    recentlyDeletedIds.current.add(numericId);
    
    const matched = records.find((r) => Number(r.id) === numericId);
    if (!matched) return;
    
    // Optimistic local state update
    const updatedRecords = records.filter((r) => Number(r.id) !== numericId);
    setRecords(updatedRecords);
    localStorage.setItem(`fallback_shipments_${workspaceId}`, JSON.stringify(updatedRecords));

    if (!offlineMode) {
      try {
        const sWorkspaceId = matched.workspaceId || workspaceId;
        const docId = `${sWorkspaceId}_${numericId}`;
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

    // Synchronize to local loadsheet storage if operator field is updated
    if (fields.operator !== undefined) {
      try {
        const storedKey = `loadsheet_autosave_v2_${id}`;
        const saved = localStorage.getItem(storedKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.ls) {
            parsed.ls.operator = fields.operator;
            if (parsed.ccsMeta) {
              parsed.ccsMeta.operator = fields.operator;
            }
            localStorage.setItem(storedKey, JSON.stringify(parsed));
          }
        }
      } catch (err) {
        console.error("Local loadsheet operator sync failed:", err);
      }
    }

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

          // Synchronize to Firestore loadsheets collection if operator field is updated
          if (fields.operator !== undefined) {
            const parentWorkspaceId = matched.workspaceId || matched.ownerId || currentUser.uid;
            const lsDocRef = doc(db, "loadsheets", `${parentWorkspaceId}_${id}`);
            const lsSnap = await getDoc(lsDocRef);
            if (lsSnap.exists()) {
              const lsData = lsSnap.data();
              let changed = false;
              if (lsData.ls && lsData.ls.operator !== fields.operator) {
                lsData.ls.operator = fields.operator;
                changed = true;
              }
              if (lsData.ccsMeta && lsData.ccsMeta.operator !== fields.operator) {
                lsData.ccsMeta.operator = fields.operator;
                changed = true;
              }
              if (changed) {
                await setDoc(lsDocRef, {
                  ...lsData,
                  updatedAt: new Date().toISOString(),
                });
              }
            }
          }
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
        station: selectedPort,
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
          const initialSched = selectedPort === "MEL" ? DEFAULT_SCHEDULE : {};
          setSchedule(initialSched);
          localStorage.setItem(`fallback_schedules_${workspaceId}_${selectedPort}`, JSON.stringify(initialSched));
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
            // Clean out custom schedules from Firestore for the active port
            const deleteSchedules = Object.keys(schedule).map(async (f) => {
              const docId = `${currentUser.uid}_${selectedPort}_${f}`;
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
    localStorage.setItem(`fallback_schedules_${workspaceId}_${selectedPort}`, JSON.stringify(updatedSec));
    
    if (!currentUser) return;
    if (!offlineMode) {
      try {
        const batch = writeBatch(db);
        let hasOperations = false;

        for (const [flight, info] of Object.entries(updatedSec)) {
          const def = selectedPort === "MEL" ? DEFAULT_SCHEDULE[flight] : undefined;
          if (
            !def ||
            def.cutoff !== info.cutoff ||
            def.dest !== info.dest ||
            def.cto !== info.cto ||
            def.etd !== info.etd ||
            def.eta !== info.eta ||
            def.airline !== info.airline ||
            def.days !== info.days ||
            def.emailContacts !== info.emailContacts ||
            def.contactPhone !== info.contactPhone ||
            def.bookingPortal !== info.bookingPortal ||
            def.bookingNotes !== info.bookingNotes
          ) {
            const docId = `${workspaceId}_${selectedPort}_${flight}`;
            batch.set(doc(db, "schedules", docId), {
              flightCode: flight,
              cutoff: info.cutoff || "",
              dest: info.dest || "",
              cto: info.cto || "",
              etd: info.etd || "",
              eta: info.eta || "",
              airline: info.airline || "",
              days: info.days || "",
              emailContacts: info.emailContacts || "",
              contactPhone: info.contactPhone || "",
              bookingPortal: info.bookingPortal || "",
              bookingNotes: info.bookingNotes || "",
              ownerId: currentUser.uid,
              workspaceId: workspaceId,
              station: selectedPort,
              updatedAt: new Date().toISOString(),
            });
            hasOperations = true;
          }
        }

        for (const flight of Object.keys(schedule)) {
          if (!updatedSec[flight]) {
            const docId = `${workspaceId}_${selectedPort}_${flight}`;
            const isDefault = selectedPort === "MEL" && DEFAULT_SCHEDULE[flight];
            if (isDefault) {
              batch.set(doc(db, "schedules", docId), {
                flightCode: flight,
                isDeleted: true,
                ownerId: currentUser.uid,
                workspaceId: workspaceId,
                station: selectedPort,
                updatedAt: new Date().toISOString(),
              });
            } else {
              batch.delete(doc(db, "schedules", docId));
            }
            hasOperations = true;
          }
        }

        if (hasOperations) {
          await batch.commit();
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

  // FILTER RECORDS BY SELECTED PORT so they are independent of each port's manifest!
  const portRecords = records.filter(r => (r.station || "MEL") === selectedPort);

  // Stat computations for dashboard widget (PER DAY matching selected date!)
  const dayRecordsForStats = portRecords.filter((r) => r.date === selectedDate);
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
        {quotaExceeded ? (
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, background: "#fef2f2", color: "#991b1b", borderBottom: "1px solid #fca5a5", padding: "12px 24px", fontSize: "12.5px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 100, boxSizing: "border-box", gap: "10px" }}>
            <span style={{ fontSize: "12px", textAlign: "left" }}>
              ⚠️ <strong>Cloud Quota Limit Exceeded (Spark Free Tier):</strong> Google Firebase Firestore's free-tier write limit has been reached for today. 
              We have automatically activated <strong>Offline Safeguard Mode</strong>. All cargo inputs, load sheets, and flight mapping records 
              are being saved securely to your local browser storage, allowing you to continue using all features without interruption!
            </span>
            <button onClick={() => setQuotaExceeded(false)} style={{ background: "transparent", border: "none", color: "#991b1b", fontWeight: "bold", cursor: "pointer", fontSize: "14px" }}>✕</button>
          </div>
        ) : dbError ? (
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, background: "#fffbeb", color: "#92400e", borderBottom: "1px solid #fde68a", padding: "12px 24px", fontSize: "12.5px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 100, boxSizing: "border-box", gap: "10px" }}>
            <span style={{ fontSize: "12px", textAlign: "left" }}>
              ⚠️ <span><strong>Cloud Sync issue:</strong> {dbError}</span>
            </span>
            <button onClick={() => setDbError("")} style={{ background: "transparent", border: "none", color: "#92400e", fontWeight: "bold", cursor: "pointer", fontSize: "14px" }}>✕</button>
          </div>
        ) : null}
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

          {isResettingPassword ? (
            <form onSubmit={handlePasswordResetSubmit} style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: "14px" }}>
              <h3 style={{ fontSize: "15px", fontWeight: 800, color: "#1e293b", margin: "0 0 4px 0", textAlign: "center" }}>Reset Workstation Password</h3>
              <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 12px 0", textAlign: "center", lineHeight: "1.4" }}>
                Verify your registered account details below to set a new workstation password.
              </p>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "4px" }}>Registered Email Address:</label>
                <input
                  type="email"
                  placeholder="e.g. employee@seaway.com.au"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", fontSize: "13px", border: "1px solid #cbd5e1", borderRadius: "10px", outline: "none", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "4px" }}>Verification Staff Name:</label>
                <input
                  type="text"
                  placeholder="Exact registered full name"
                  value={resetName}
                  onChange={(e) => setResetName(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", fontSize: "13px", border: "1px solid #cbd5e1", borderRadius: "10px", outline: "none", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "4px" }}>IATA:</label>
                <select
                  value={resetStation}
                  onChange={(e) => setResetStation(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", fontSize: "13px", border: "1px solid #cbd5e1", borderRadius: "10px", outline: "none", boxSizing: "border-box", background: "#ffffff" }}
                >
                  {ALL_STATIONS.map((st) => (
                    <option key={st.value} value={st.value}>{st.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "4px" }}>Choose New Password:</label>
                <input
                  type="text"
                  placeholder="Enter secure new password"
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", fontSize: "13px", border: "1px solid #cbd5e1", borderRadius: "10px", outline: "none", boxSizing: "border-box", fontWeight: "bold", color: "#0284c7" }}
                />
              </div>

              {resetError && (
                <div style={{ padding: "10px 12px", background: "#fef2f2", border: "1px solid #fee2e2", borderRadius: "10px", color: "#ef4444", fontSize: "12px", fontWeight: 600 }}>
                  {resetError}
                </div>
              )}

              {resetSuccess && (
                <div style={{ padding: "10px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", color: "#16a34a", fontSize: "12px", fontWeight: 600 }}>
                  {resetSuccess}
                </div>
              )}

              <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
                <button
                  type="submit"
                  disabled={isSubmittingReset}
                  style={{
                    flex: 1,
                    padding: "11px",
                    background: "#16a34a",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "10px",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    opacity: isSubmittingReset ? 0.7 : 1
                  }}
                >
                  {isSubmittingReset ? "Verifying..." : "Reset Password"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsResettingPassword(false);
                    setPinError("");
                    setResetError("");
                    setResetSuccess("");
                  }}
                  style={{
                    background: "#f1f5f9",
                    border: "1px solid #cbd5e1",
                    color: "#475569",
                    padding: "11px 16px",
                    borderRadius: "10px",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  Back to Login
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleLoginSubmit} style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: "16px" }}>
              <p style={{ fontSize: "13px", color: "#64748b", lineHeight: 1.5, marginBottom: "8px", textAlign: "center" }}>
                Provide your workstation ID details to access the cargo manifests and load sheets.
              </p>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "6px" }}>User name or Email:</label>
                <input
                  type="text"
                  placeholder="e.g. melexpair@seaway.com.au or Staff Name"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  style={{ width: "100%", padding: "11px 14px", fontSize: "13.5px", border: "1px solid #cbd5e1", borderRadius: "12px", outline: "none", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "6px" }}>Password:</label>
                <input
                  type="password"
                  placeholder="Enter Password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  style={{ width: "100%", padding: "11px 14px", fontSize: "13.5px", border: "1px solid #cbd5e1", borderRadius: "12px", outline: "none", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "6px" }}>IATA:</label>
                <select
                  value={loginStation}
                  onChange={(e) => setLoginStation(e.target.value)}
                  style={{ width: "100%", padding: "11px 14px", fontSize: "13.5px", border: "1px solid #cbd5e1", borderRadius: "12px", outline: "none", boxSizing: "border-box", background: "#ffffff", color: "#1e293b", cursor: "pointer" }}
                >
                  {ALL_STATIONS.map((st) => (
                    <option key={st.value} value={st.value}>{st.label}</option>
                  ))}
                </select>
              </div>

              {pinError && (
                <div style={{ padding: "10px 12px", background: "#fef2f2", border: "1px solid #fee2e2", borderRadius: "10px", color: "#ef4444", fontSize: "12.5px", fontWeight: 600 }}>
                  {pinError}
                </div>
              )}

              <button
                type="submit"
                disabled={submittingAuth}
                style={{
                  width: "100%",
                  padding: "13px",
                  background: "#0284c7",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "12px",
                  fontSize: "14px",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  opacity: submittingAuth ? 0.7 : 1,
                  marginTop: "6px"
                }}
              >
                {submittingAuth ? "Authorizing access..." : "Sign In to Workstation"}
              </button>

              <div style={{ textAlign: "center", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsResettingPassword(true);
                    setPinError("");
                    setResetError("");
                    setResetSuccess("");
                  }}
                  style={{ background: "transparent", border: "none", color: "#0284c7", fontSize: "12.5px", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}
                >
                  Forgot Password? Reset password
                </button>
              </div>
            </form>
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
        background: "#f8fafc",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        color: "#1e293b",
        overflow: "hidden",
        fontSize: "13px",
      }}
    >
      {quotaExceeded ? (
        <div style={{ background: "#fef2f2", color: "#991b1b", borderBottom: "1px solid #fca5a5", padding: "10px 24px", fontSize: "12.5px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, zIndex: 1000, gap: "12px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "16px" }}>⚠️</span>
            <span>
              <strong>Cloud Quota Limit Exceeded (Spark Free Tier):</strong> Firebase Firestore's free-tier write limit has been reached for today. 
              We have automatically activated <strong>Offline Safeguard Mode</strong>. All cargo inputs, load sheets, and flight mapping records 
              are being saved securely to your local browser storage, allowing you to continue using all features without interruption!
            </span>
          </span>
          <button onClick={() => setQuotaExceeded(false)} style={{ background: "transparent", border: "none", color: "#991b1b", fontWeight: "bold", cursor: "pointer", fontSize: "14px" }}>✕</button>
        </div>
      ) : dbError ? (
        <div style={{ background: "#fffbeb", color: "#92400e", borderBottom: "1px solid #fde68a", padding: "10px 24px", fontSize: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, zIndex: 999, gap: "12px" }}>
          <span>⚠️ <strong>Cloud Database connection issue:</strong> {dbError}</span>
          <button onClick={() => setDbError("")} style={{ background: "transparent", border: "none", color: "#92400e", fontWeight: "bold", cursor: "pointer", fontSize: "12px" }}>✕</button>
        </div>
      ) : null}

      {/* Premium Corporate Top Header */}
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
          flexShrink: 0,
          zIndex: 10,
          gap: "16px",
        }}
      >
        {/* Left Side branding + Port selector + Header Navigation Tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
            <div 
              style={{ 
                width: "28px", 
                height: "28px", 
                borderRadius: "6px", 
                background: "#f0f9ff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid #bae6fd",
              }}
            >
              <Plane style={{ width: "14px", height: "14px", color: "#0284c7" }} />
            </div>
            <SeawayLogo height={20} theme="light" />
          </div>
          
          <div style={{ display: "flex", alignItems: "center", gap: "6px", borderLeft: "1px solid #e2e8f0", paddingLeft: "12px", marginRight: "8px", flexShrink: 0 }}>
            <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.03em" }}>Port:</span>
            <select
              id="active-port-select"
              value={selectedPort}
              onChange={(e) => {
                const port = e.target.value;
                setSelectedPort(port);
                localStorage.setItem("seaway_active_port", port);
              }}
              disabled={!isUserAdminCurrent()}
              style={{
                padding: "3px 22px 3px 8px",
                fontSize: "11.5px",
                fontWeight: 700,
                color: "#0369a1",
                background: !isUserAdminCurrent() ? "#f1f5f9" : "#f0f9ff",
                border: "1px solid #bae6fd",
                borderRadius: "6px",
                cursor: !isUserAdminCurrent() ? "default" : "pointer",
                outline: "none",
                appearance: "none",
                backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%230284c7' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 6px center",
                backgroundSize: "10px",
              }}
              title={!isUserAdminCurrent() ? `Active Hub (Locked to assigned station: ${selectedPort})` : "Switch Active Operational Port Hub"}
            >
              {ALL_STATIONS.map((st) => (
                <option key={st.value} value={st.value}>
                  {st.value}
                </option>
              ))}
            </select>
          </div>

          {/* Navigation subheadings moved here, in line with logo */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", overflowX: "auto", padding: "4px 0", flex: 1, scrollbarWidth: "none" }}>
            {[
              { 
                id: "manifest", 
                label: "Cargo Manifest List", 
                icon: <Layers style={{ width: "13px", height: "13px" }} />,
                badge: totalLoadsCount.toString()
              },
              { 
                id: "search", 
                label: "Date Range Search", 
                icon: <Calendar style={{ width: "13px", height: "13px" }} />,
              },
              { 
                id: "add", 
                label: editingShipment ? "Edit Shipment" : "Plan Shipment", 
                icon: <PlusCircle style={{ width: "13px", height: "13px" }} />,
              },
              { 
                id: "settings", 
                label: "Administration", 
                icon: <Settings2 style={{ width: "13px", height: "13px" }} />,
              },
            ].filter((item) => isTabAllowed(item.id)).map((item) => {
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
                    padding: "5px 11px",
                    borderRadius: "16px",
                    border: isActive ? "1px solid #bae6fd" : "1px solid #e2e8f0",
                    background: isActive ? "#f0f9ff" : "#ffffff",
                    color: isActive ? "#0369a1" : "#475569",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    fontSize: "11px",
                    fontWeight: isActive ? 750 : 500,
                    gap: "5px",
                    transition: "all 0.15s ease",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  <div style={{ color: isActive ? "#0284c7" : "#64748b", display: "flex", alignItems: "center" }}>
                    {item.icon}
                  </div>
                  <span>{item.label}</span>
                  {item.badge !== undefined && (
                    <span 
                      style={{ 
                        fontSize: "9px", 
                        fontWeight: 750, 
                        background: isActive ? "#0284c7" : "#64748b", 
                        color: "#ffffff", 
                        padding: "1px 5px", 
                        borderRadius: "8px" 
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right side Profile & status indicators & sign out */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
          {/* Cloud Sync active indicator */}
          <div style={{ display: "none", alignItems: "center", gap: "4px", color: "#15803d" }} className="md:flex">
            <Database style={{ width: "11px", height: "11px", color: "#16a34a" }} />
            <span style={{ fontSize: "10.5px", fontWeight: 700 }}>Cloud Sync</span>
          </div>

          <span style={{ fontSize: "9.5px", color: "#b45309", fontWeight: 750, background: "#fef3c7", padding: "2px 6px", borderRadius: "4px" }} className="sm:inline-block">
            {selectedPort}
          </span>

          {/* Elegant authenticated user info */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {(currentUser as any).photoURL ? (
              <img
                src={(currentUser as any).photoURL}
                alt={currentUser.displayName || "User"}
                referrerPolicy="no-referrer"
                style={{ width: "28px", height: "28px", borderRadius: "50%", border: "2px solid #0284c7" }}
              />
            ) : (
              <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#e0f2fe", color: "#0369a1", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "12px" }}>
                {(currentUser.displayName || "U")[0].toUpperCase()}
              </div>
            )}
            <div style={{ display: "none", flexDirection: "column" }} className="sm:flex">
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#0f172a", lineHeight: "1.2" }}>{currentUser.displayName || "Operator"}</span>
            </div>
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
                setWorkspaceId("");
                setWorkspaceName("Personal Workspace");
              }
            }}
            style={{
              background: "transparent",
              border: "1px solid #e2e8f0",
              cursor: "pointer",
              padding: "5px 10px",
              borderRadius: "6px",
              color: "#475569",
              fontSize: "11px",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: "4px",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#fee2e2";
              e.currentTarget.style.borderColor = "#fecaca";
              e.currentTarget.style.color = "#ef4444";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "#e2e8f0";
              e.currentTarget.style.color = "#475569";
            }}
          >
            <LogOut style={{ width: "12px", height: "12px" }} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Corporate Workspace */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>

        {/* Content Section Panel */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
          
          {/* Workspace content page */}
          <div style={{ flex: 1, padding: "24px", overflowX: "scroll", overflowY: "scroll", background: "#f8fafc" }}>
              {activeTab === "manifest" && isTabAllowed("manifest") && (
                <ShipmentsTab
                  records={portRecords}
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
                  onGoToFlightSchedule={handleGoToFlightSchedule}
                />
              )}

              {activeTab === "search" && isTabAllowed("search") && (() => {
                const { dupIds, dupDetails } = buildDuplicateSets(portRecords);
                return (
                  <DateRangeSearch
                    records={portRecords}
                    onEdit={handleEditShipmentClick}
                    onDelete={handleDeleteShipment}
                    onLoadsheet={(r) => setActiveLoadsheet(r)}
                    onJobSheet={(r) => setActiveJobSheet(r)}
                    onToggleComplete={handleToggleComplete}
                    onUpdate={handleUpdateShipment}
                    dupIds={dupIds}
                    dupDetails={dupDetails}
                    schedule={schedule}
                    onGoToFlightSchedule={handleGoToFlightSchedule}
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

              {activeTab === "add" && isTabAllowed("add") && (
                <EntryForm
                  initial={editingShipment}
                  schedule={schedule}
                  onCancel={() => {
                    setEditingShipment(null);
                    setActiveTab("manifest");
                  }}
                  onSave={handleAddNewShipment}
                  onGoToFlights={() => {
                    setEditingShipment(null);
                    setActiveTab("settings");
                    setSettingsSubTab("flights");
                  }}
                />
              )}

              {activeTab === "settings" && isTabAllowed("settings") && (
                <div style={{ width: "100%", display: "flex", flexDirection: "column" }}>
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "24px" }}>
                    
                    {/* Masthead Header */}
                    <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", borderRadius: "20px", padding: "24px", color: "#ffffff", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.05)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <Settings2 style={{ width: "24px", height: "24px", color: "#38bdf8" }} />
                        <h2 style={{ fontSize: "20px", fontWeight: 800, margin: 0, letterSpacing: "-0.5px" }}>Administration & Settings</h2>
                      </div>
                      <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "#94a3b8", lineHeight: "1.4" }}>
                        Configure regional airport station nodes, set administrator overrides, and register dispatchers.
                      </p>
                    </div>


                    {/* Navigation Sub-Tabs for Settings */}
                    <div style={{ display: "flex", gap: "12px", borderBottom: "1px solid #cbd5e1", paddingBottom: "14px", marginBottom: "8px", flexWrap: "wrap" }}>
                      <button
                        id="subtab-setup-btn"
                        onClick={() => setSettingsSubTab("setup")}
                        style={{
                          padding: "10px 20px",
                          borderRadius: "12px",
                          border: settingsSubTab === "setup" ? "1.5px solid #0284c7" : "1px solid #cbd5e1",
                          backgroundColor: settingsSubTab === "setup" ? "#f0f9ff" : "#ffffff",
                          color: settingsSubTab === "setup" ? "#0284c7" : "#475569",
                          fontWeight: 800,
                          fontSize: "13px",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          boxShadow: settingsSubTab === "setup" ? "0 4px 6px -1px rgba(2, 132, 199, 0.08)" : "none"
                        }}
                      >
                        ⚙️ Account Setup
                      </button>
                      <button
                        id="subtab-info-btn"
                        onClick={() => setSettingsSubTab("info")}
                        style={{
                          padding: "10px 20px",
                          borderRadius: "12px",
                          border: settingsSubTab === "info" ? "1.5px solid #0284c7" : "1px solid #cbd5e1",
                          backgroundColor: settingsSubTab === "info" ? "#f0f9ff" : "#ffffff",
                          color: settingsSubTab === "info" ? "#0284c7" : "#475569",
                          fontWeight: 800,
                          fontSize: "13px",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          boxShadow: settingsSubTab === "info" ? "0 4px 6px -1px rgba(2, 132, 199, 0.08)" : "none"
                        }}
                      >
                        👥 User Information
                      </button>
                      <button
                        id="subtab-templates-btn"
                        onClick={() => setSettingsSubTab("templates")}
                        style={{
                          padding: "10px 20px",
                          borderRadius: "12px",
                          border: settingsSubTab === "templates" ? "1.5px solid #0284c7" : "1px solid #cbd5e1",
                          backgroundColor: settingsSubTab === "templates" ? "#f0f9ff" : "#ffffff",
                          color: settingsSubTab === "templates" ? "#0284c7" : "#475569",
                          fontWeight: 800,
                          fontSize: "13px",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          boxShadow: settingsSubTab === "templates" ? "0 4px 6px -1px rgba(2, 132, 199, 0.08)" : "none"
                        }}
                      >
                        📊 Cargo Templates
                      </button>
                      {isTabAllowed("flights") && (
                        <button
                          id="subtab-flights-btn"
                          onClick={() => setSettingsSubTab("flights")}
                          style={{
                            padding: "10px 20px",
                            borderRadius: "12px",
                            border: settingsSubTab === "flights" ? "1.5px solid #0284c7" : "1px solid #cbd5e1",
                            backgroundColor: settingsSubTab === "flights" ? "#f0f9ff" : "#ffffff",
                            color: settingsSubTab === "flights" ? "#0284c7" : "#475569",
                            fontWeight: 800,
                            fontSize: "13px",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            boxShadow: settingsSubTab === "flights" ? "0 4px 6px -1px rgba(2, 132, 199, 0.08)" : "none"
                          }}
                        >
                          ✈️ Flight Schedule Admin
                        </button>
                      )}
                    </div>

                    {/* Admin privileged view */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                      
                      {/* Left: Setup account form with subheading */}
                      {settingsSubTab === "setup" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                          <h3 id="account-setup-subheading" style={{ fontSize: "14px", fontWeight: 800, color: "#0f172a", margin: "4px 0 2px 2px", paddingBottom: "6px", borderBottom: "2px solid #e2e8f0", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                            ⚙️ Account Setup
                          </h3>
                          <div style={{ background: "#ffffff", borderRadius: "18px", border: "1px solid #e2e8f0", padding: "24px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.02)", flex: 1 }}>
                          
                          {!isUserAdminCurrent() && (
                            <div style={{ padding: "10px 12px", background: "#fffbeb", border: "1px solid #fef3c7", borderRadius: "10px", color: "#b45309", fontSize: "12px", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px", marginBottom: "16px" }}>
                              ⚠️ Read-Only Mode: Administrator privilege is required to setup or modify administration accounts.
                            </div>
                          )}

                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px" }}>
                            <span style={{ fontSize: "15px", fontWeight: 800, color: "#1e293b" }}>
                              {editingAccount ? "✏️ Edit Administration Account" : "➕ Setup New Administration Account"}
                            </span>
                          </div>
                          
                          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                            <div>
                              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "6px" }}>Staff name:</label>
                              <input
                                type="text"
                                placeholder="Staff Name"
                                value={adminAddName}
                                onChange={(e) => setAdminAddName(e.target.value)}
                                disabled={!isUserAdminCurrent()}
                                style={{ width: "100%", padding: "10px 12px", fontSize: "13px", border: "1px solid #cbd5e1", borderRadius: "10px", outline: "none", boxSizing: "border-box", background: !isUserAdminCurrent() ? "#f1f5f9" : "#ffffff" }}
                              />
                            </div>

                            <div>
                              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "6px" }}>Email Address:</label>
                              <input
                                type="email"
                                placeholder="Email Address"
                                value={adminAddEmail}
                                onChange={(e) => setAdminAddEmail(e.target.value)}
                                disabled={!isUserAdminCurrent() || editingAccount !== null} // email key must remain identical for document ID index
                                style={{ width: "100%", padding: "10px 12px", fontSize: "13px", border: "1px solid #cbd5e1", borderRadius: "10px", outline: "none", boxSizing: "border-box", background: (!isUserAdminCurrent() || editingAccount) ? "#f1f5f9" : "#ffffff" }}
                              />
                            </div>

                            <div>
                              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "6px" }}>IATA:</label>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: "8px", padding: "12px", border: "1px solid #cbd5e1", borderRadius: "10px", background: !isUserAdminCurrent() ? "#f1f5f9" : "#ffffff" }}>
                                {ALL_STATIONS.map((st) => {
                                  const checkedStations = (adminAddStation || "").split(",").map(v => v.trim()).filter(Boolean);
                                  const isChecked = checkedStations.includes(st.value);
                                  return (
                                    <label key={st.value} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: "#334155", cursor: !isUserAdminCurrent() ? "default" : "pointer" }} title={st.label}>
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        disabled={!isUserAdminCurrent()}
                                        onChange={(e) => {
                                          let updated;
                                          if (e.target.checked) {
                                            updated = [...checkedStations, st.value];
                                          } else {
                                            updated = checkedStations.filter(v => v !== st.value);
                                          }
                                          setAdminAddStation(updated.join(", "));
                                        }}
                                        style={{ accentColor: "#0284c7", width: "15px", height: "15px", cursor: !isUserAdminCurrent() ? "default" : "pointer" }}
                                      />
                                      <span>{st.value}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>

                            <div>
                              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "6px" }}>Password:</label>
                              <input
                                type="text"
                                placeholder="Set secure password"
                                value={adminAddPasscode}
                                onChange={(e) => setAdminAddPasscode(e.target.value)}
                                disabled={!isUserAdminCurrent()}
                                style={{ width: "100%", padding: "10px 12px", fontSize: "13px", border: "1px solid #cbd5e1", borderRadius: "10px", outline: "none", boxSizing: "border-box", fontWeight: "bold", color: "#0284c7", background: !isUserAdminCurrent() ? "#f1f5f9" : "#ffffff" }}
                              />
                            </div>

                            <div>
                              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "6px" }}>Access:</label>
                              <select
                                value={adminAddRole}
                                onChange={(e) => setAdminAddRole(e.target.value)}
                                disabled={!isUserAdminCurrent()}
                                style={{ width: "100%", padding: "10px 12px", fontSize: "13px", border: "1px solid #cbd5e1", borderRadius: "10px", outline: "none", boxSizing: "border-box", background: !isUserAdminCurrent() ? "#f1f5f9" : "#ffffff" }}
                              >
                                <option value="Standard user">Standard user</option>
                                <option value="Admin User">Admin User</option>
                              </select>
                            </div>

                            {adminAddError && (
                              <div style={{ padding: "10px 12px", background: "#fef2f2", border: "1px solid #fee2e2", borderRadius: "10px", color: "#ef4444", fontSize: "12px", fontWeight: 600 }}>
                                ⚠️ {adminAddError}
                              </div>
                            )}

                            {adminAddSuccess && (
                              <div style={{ padding: "10px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", color: "#16a34a", fontSize: "12px", fontWeight: 600 }}>
                                ✓ {adminAddSuccess}
                              </div>
                            )}

                            <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                              {editingAccount ? (
                                <>
                                  <button
                                    onClick={handleUpdateAdminUser}
                                    disabled={isSubmittingAdminUser}
                                    style={{
                                      flex: 2,
                                      padding: "12px",
                                      background: "#16a34a",
                                      color: "#ffffff",
                                      border: "none",
                                      borderRadius: "10px",
                                      fontSize: "13px",
                                      fontWeight: 700,
                                      cursor: "pointer",
                                      transition: "all 0.15s ease",
                                      opacity: isSubmittingAdminUser ? 0.7 : 1
                                    }}
                                  >
                                    {isSubmittingAdminUser ? "Saving..." : "💾 Save Changes"}
                                  </button>
                                  <button
                                    onClick={handleCancelEditAccount}
                                    style={{
                                      flex: 1,
                                      padding: "12px",
                                      background: "#ef4444",
                                      color: "#ffffff",
                                      border: "none",
                                      borderRadius: "10px",
                                      fontSize: "13px",
                                      fontWeight: 700,
                                      cursor: "pointer",
                                      transition: "all 0.15s ease"
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={handleAdminRegisterUser}
                                  disabled={isSubmittingAdminUser}
                                  style={{
                                    width: "100%",
                                    padding: "12px",
                                    background: "#0284c7",
                                    color: "#ffffff",
                                    border: "none",
                                    borderRadius: "10px",
                                    fontSize: "13px",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    transition: "all 0.15s ease",
                                    boxShadow: "0 2px 4px rgba(2, 132, 199, 0.1)",
                                    opacity: isSubmittingAdminUser ? 0.7 : 1
                                  }}
                                  onMouseEnter={(e) => { if (!isSubmittingAdminUser) e.currentTarget.style.background = "#0369a1"; }}
                                  onMouseLeave={(e) => { if (!isSubmittingAdminUser) e.currentTarget.style.background = "#0284c7"; }}
                                >
                                  {isSubmittingAdminUser ? "Creating Account..." : "🚀 Create User Account"}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                        </div>
                      )}

                      {/* Right: Active list of Accounts with subheading */}
                      {settingsSubTab === "info" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                          <h3 id="users-information-subheading" style={{ fontSize: "14px", fontWeight: 800, color: "#0f172a", margin: "4px 0 2px 2px", paddingBottom: "6px", borderBottom: "2px solid #e2e8f0", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                            👥 User Information
                          </h3>
                          <div style={{ background: "#ffffff", borderRadius: "18px", border: "1px solid #e2e8f0", padding: "24px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.02)", display: "flex", flexDirection: "column", flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px" }}>
                            <span style={{ fontSize: "16px", fontWeight: 800, color: "#1e293b" }}>👥 Administration Ledger</span>
                            <span style={{ fontSize: "11px", fontWeight: 700, background: "#e0f2fe", color: "#0369a1", padding: "2px 8px", borderRadius: "12px" }}>
                              {getCombinedProfiles().length} Active
                            </span>
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", maxHeight: "450px", flex: 1 }} className="custom-scrollbar">
                            {/* Standard Profiles (Built-ins) */}
                            {STATION_PROFILES
                              .filter(p => isUserAdminCurrent() || p.email.toLowerCase() === currentUser?.email?.toLowerCase())
                              .map((profile) => {
                                const showBuiltInPass = currentUser?.email?.toLowerCase() === profile.email.toLowerCase();
                                const isTargetingThis = passwordResetTarget?.email === profile.email;
                                const liveUser = workUsers.find(u => u.email.toLowerCase() === profile.email.toLowerCase());
                                const actualPass = liveUser ? liveUser.passcode : "1234";
                                return (
                                  <div key={profile.email} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", border: "1px solid #e2e8f0", borderRadius: "10px", background: "#f8fafc", gap: "12px", flexWrap: "wrap", transition: "all 0.15s ease" }}>
                                    
                                    {/* Left Area: Avatar and Info */}
                                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: "1 1 260px", minWidth: 0 }}>
                                      <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: profile.color, color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "bold", flexShrink: 0 }}>
                                        {profile.initials}
                                      </div>
                                      <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: "12.5px", fontWeight: 750, color: "#0f172a", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "6px" }}>
                                          <span>{profile.name}</span>
                                          <span style={{ fontSize: "9.5px", fontWeight: 700, padding: "1px 5px", borderRadius: "4px", background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0" }}>Built-in</span>
                                        </div>
                                        <div style={{ fontSize: "11px", color: "#64748b", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                                          ✉ {profile.email}
                                        </div>
                                        <div style={{ fontSize: "10.5px", color: "#64748b", marginTop: "1px", display: "flex", alignItems: "center", gap: "6px" }}>
                                          <span style={{ fontWeight: 650, color: "#0ea5e9" }}>📍 IATA: MEL</span>
                                          <span style={{ color: "#cbd5e1" }}>•</span>
                                          <span style={{ color: "#0284c7" }}>Role: Admin User</span>
                                          <span style={{ color: "#cbd5e1" }}>•</span>
                                          <span style={{ color: "#475569", fontWeight: 700, fontFamily: "monospace" }}>🔑 {showBuiltInPass ? actualPass : "••••"}</span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Middle Area: Allowed Tabs (All for admin) */}
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", flex: "1 1 200px", alignItems: "center" }}>
                                      {[
                                        { id: "manifest", name: "Manifest" },
                                        { id: "search", name: "Search" },
                                        { id: "add", name: "New Entry" },
                                        { id: "flights", name: "Flights" },
                                        { id: "settings", name: "Settings" }
                                      ].map(tab => (
                                        <span
                                          key={tab.id}
                                          style={{
                                            padding: "1px 5px",
                                            fontSize: "9px",
                                            fontWeight: 700,
                                            borderRadius: "4px",
                                            border: "1px solid #16a34a",
                                            background: "#fdfdfd",
                                            color: "#16a34a",
                                            display: "inline-flex",
                                            alignItems: "center"
                                          }}
                                        >
                                          ✓ {tab.name}
                                        </span>
                                      ))}
                                    </div>

                                    {/* Right Area: Action Controls & Inline password editor */}
                                    <div style={{ display: "flex", gap: "6px", alignItems: "center", justifyContent: "flex-end" }}>
                                      {isTargetingThis ? (
                                        <div style={{ display: "flex", alignItems: "center", gap: "4px", background: "#f0f9ff", padding: "3px 8px", borderRadius: "6px", border: "1px solid #bae6fd" }}>
                                          <input
                                            type="text"
                                            value={newPasswordValue}
                                            onChange={(e) => setNewPasswordValue(e.target.value)}
                                            placeholder="New Pass"
                                            style={{ width: "80px", padding: "3px 6px", fontSize: "11px", border: "1px solid #cbd5e1", borderRadius: "5px", outline: "none" }}
                                          />
                                          <button
                                            onClick={() => handleCommitPasswordChange(profile, newPasswordValue)}
                                            style={{ background: "#22c55e", color: "#ffffff", border: "none", borderRadius: "5px", padding: "3px 6px", fontSize: "10px", fontWeight: "bold", cursor: "pointer" }}
                                          >
                                            Save
                                          </button>
                                          <button
                                            onClick={() => { setPasswordResetTarget(null); setNewPasswordValue(""); }}
                                            style={{ background: "#94a3b8", color: "#ffffff", border: "none", borderRadius: "5px", padding: "3px 6px", fontSize: "10px", fontWeight: "bold", cursor: "pointer" }}
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      ) : (
                                        <>
                                          <button
                                            onClick={() => setActiveInviteUser({
                                              displayName: profile.name,
                                              email: profile.email,
                                              passcode: actualPass,
                                              station: "MEL"
                                            })}
                                            style={{
                                              background: "#f0f9ff",
                                              border: "1px solid #cbd5e1",
                                              borderRadius: "6px",
                                              padding: "3px 8px",
                                              fontSize: "11px",
                                              fontWeight: 700,
                                              color: "#0284c7",
                                              cursor: "pointer"
                                            }}
                                            title="Share Setup Details"
                                          >
                                            ✉️ Share
                                          </button>
                                          {showBuiltInPass && (
                                            <button
                                              onClick={() => initiatePasswordReset(profile)}
                                              style={{
                                                background: "#0284c7",
                                                color: "#ffffff",
                                                border: "none",
                                                borderRadius: "6px",
                                                padding: "3px 8px",
                                                fontSize: "11px",
                                                fontWeight: 700,
                                                cursor: "pointer"
                                              }}
                                              title="Change Password of this built-in account"
                                            >
                                              🔑 Pass
                                            </button>
                                          )}
                                        </>
                                      )}
                                    </div>

                                  </div>
                                );
                              })}

                            {/* Dynamic Work Users */}
                            {workUsers
                              .filter(u => isUserAdminCurrent() || u.email.toLowerCase() === currentUser?.email?.toLowerCase())
                              .map((item) => {
                                const showPassword = !isUserAdminCurrent() || (currentUser?.email?.toLowerCase() === item.email.toLowerCase());
                                const isOwnCard = currentUser?.email?.toLowerCase() === item.email.toLowerCase();
                                const isTargetingThis = passwordResetTarget?.email === item.email;
                                return (
                                  <div key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", border: "1px solid #bae6fd", borderRadius: "10px", background: "#f0f9ff", gap: "12px", flexWrap: "wrap", transition: "all 0.15s ease" }}>
                                    
                                    {/* Left Area: Avatar and Work Info */}
                                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: "1 1 260px", minWidth: 0 }}>
                                      <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#0ea5e9", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "bold", flexShrink: 0 }}>
                                        {item.displayName ? item.displayName.slice(0, 2).toUpperCase() : "ST"}
                                      </div>
                                      <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: "12.5px", fontWeight: 750, color: "#0369a1", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                                          {item.displayName}
                                        </div>
                                        <div style={{ fontSize: "11px", color: "#0284c7", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                                          ✉ {item.email}
                                        </div>
                                        <div style={{ fontSize: "10.5px", color: "#0891b2", marginTop: "1px", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                          <span style={{ fontWeight: 650 }}>📍 IATA: {item.station || "MEL"}</span>
                                          <span style={{ color: "#bae6fd" }}>•</span>
                                          <span>Role: {item.role || "Standard user"}</span>
                                          <span style={{ color: "#bae6fd" }}>•</span>
                                          <span style={{ fontWeight: 700, fontFamily: "monospace" }}>🔑 {showPassword ? item.passcode : "••••"}</span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Middle Area: Interactive Allowed Tabs */}
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", flex: "1 1 200px", alignItems: "center" }}>
                                      {[
                                        { id: "manifest", name: "Manifest" },
                                        { id: "search", name: "Search" },
                                        { id: "add", name: "New Entry" },
                                        { id: "flights", name: "Flights" },
                                        { id: "settings", name: "Settings" }
                                      ].map(tab => {
                                        const allowed = !item.allowedTabs || item.allowedTabs.includes(tab.id);
                                        const canManage = isUserAdminCurrent();
                                        return (
                                          <button
                                            key={tab.id}
                                            disabled={!canManage}
                                            onClick={() => toggleUserTabAccess(item, tab.id)}
                                            style={{
                                              padding: "1px 5px",
                                              fontSize: "9px",
                                              fontWeight: 700,
                                              borderRadius: "4px",
                                              border: allowed ? "1px solid #16a34a" : "1px solid #cbd5e1",
                                              background: allowed ? "#f0fdf4" : "#ffffff",
                                              color: allowed ? "#15803d" : "#64748b",
                                              cursor: canManage ? "pointer" : "default",
                                              display: "inline-flex",
                                              alignItems: "center",
                                              gap: "2px",
                                              transition: "all 0.1s ease",
                                              opacity: canManage ? 1 : 0.85
                                            }}
                                            title={canManage ? `Click to ${allowed ? "revoke" : "grant"} ${tab.name}` : `${tab.name} Access`}
                                          >
                                            {allowed ? "✓" : "✗"} {tab.name}
                                          </button>
                                        );
                                      })}
                                    </div>

                                    {/* Right Area: Password reset or edit controls */}
                                    <div style={{ display: "flex", gap: "6px", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
                                      {isTargetingThis ? (
                                        <div style={{ display: "flex", alignItems: "center", gap: "4px", background: "#f0f9ff", padding: "3px 8px", borderRadius: "6px", border: "1px solid #bae6fd" }}>
                                          <input
                                            type="text"
                                            value={newPasswordValue}
                                            onChange={(e) => setNewPasswordValue(e.target.value)}
                                            placeholder="New Pass"
                                            style={{ width: "80px", padding: "3px 6px", fontSize: "11px", border: "1px solid #cbd5e1", borderRadius: "5px", outline: "none" }}
                                          />
                                          <button
                                            onClick={() => handleCommitPasswordChange(item, newPasswordValue)}
                                            style={{ background: "#22c55e", color: "#ffffff", border: "none", borderRadius: "5px", padding: "3px 6px", fontSize: "10px", fontWeight: "bold", cursor: "pointer" }}
                                          >
                                            Save
                                          </button>
                                          <button
                                            onClick={() => { setPasswordResetTarget(null); setNewPasswordValue(""); }}
                                            style={{ background: "#94a3b8", color: "#ffffff", border: "none", borderRadius: "5px", padding: "3px 6px", fontSize: "10px", fontWeight: "bold", cursor: "pointer" }}
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      ) : (
                                        <>
                                          <button
                                            onClick={() => setActiveInviteUser({
                                              displayName: item.displayName || "Teammate",
                                              email: item.email,
                                              passcode: item.passcode,
                                              station: item.station || "MEL"
                                            })}
                                            style={{
                                              background: "#f0f9ff",
                                              border: "1px solid #bae6fd",
                                              borderRadius: "6px",
                                              padding: "3px 8px",
                                              fontSize: "11px",
                                              fontWeight: 700,
                                              color: "#0284c7",
                                              cursor: "pointer"
                                            }}
                                            title="Share Setup Details"
                                          >
                                            ✉️ Share
                                          </button>

                                          {(isOwnCard || isUserAdminCurrent()) && (
                                            <button
                                              onClick={() => initiatePasswordReset(item)}
                                              style={{
                                                background: "#0284c7",
                                                color: "#ffffff",
                                                border: "none",
                                                borderRadius: "6px",
                                                padding: "3px 8px",
                                                fontSize: "11px",
                                                fontWeight: 700,
                                                cursor: "pointer"
                                              }}
                                              title={isOwnCard ? "Change Your Password" : "Reset Password of this user"}
                                            >
                                              🔑 Pass
                                            </button>
                                          )}

                                          {isUserAdminCurrent() && (
                                            <>
                                              <button
                                                onClick={() => handleEditAccountClick(item)}
                                                style={{
                                                  background: "#ffffff",
                                                  border: "1px solid #bae6fd",
                                                  borderRadius: "6px",
                                                  padding: "3px 8px",
                                                  fontSize: "11px",
                                                  fontWeight: 700,
                                                  color: "#0369a1",
                                                  cursor: "pointer"
                                                }}
                                                title="Edit Account Details"
                                              >
                                                ✏️ Edit
                                              </button>
                                              <button
                                                onClick={() => handleDeleteWorkUser(item.id)}
                                                style={{
                                                  background: "#fef2f2",
                                                  color: "#ef4444",
                                                  border: "1px solid #fca5a5",
                                                  borderRadius: "6px",
                                                  padding: "3px 8px",
                                                  cursor: "pointer",
                                                  fontSize: "11px",
                                                  fontWeight: 700
                                                }}
                                                title="Delete Account"
                                              >
                                                Delete
                                              </button>
                                            </>
                                          )}
                                        </>
                                      )}
                                    </div>

                                  </div>
                                );
                              })}
                            
                            {STATION_PROFILES.length === 0 && workUsers.length === 0 && (
                              <div style={{ padding: "20px", textShadow: "none", fontSize: "12.5px", color: "#64748b", textAlign: "center", background: "#f8fafc", borderRadius: "12px", border: "1px dashed #cbd5e1" }}>
                                No custom operations accounts configured yet. Use the left panel to register team members.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      )}

                      {settingsSubTab === "templates" && (
                        <CargoTemplatesSettingsAdmin
                          currentUser={currentUser}
                          isAdmin={isUserAdminCurrent()}
                          selectedPort={selectedPort}
                          offlineMode={offlineMode}
                        />
                      )}

                      {settingsSubTab === "flights" && isTabAllowed("flights") && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                          <h3 id="flight-schedule-subheading" style={{ fontSize: "14px", fontWeight: 800, color: "#0f172a", margin: "4px 0 2px 2px", paddingBottom: "6px", borderBottom: "2px solid #e2e8f0", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                            ✈️ Flight Schedule Administrative Ledger
                          </h3>
                          <FlightAdmin
                            schedule={schedule}
                            onChange={handleScheduleChange}
                            highlightFlight={highlightFlight}
                            onClearHighlightFlight={() => setHighlightFlight(null)}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>

      {/* Modals viewframes mapping */}
      {activeJobSheet && (
        <JobSheetModal row={activeJobSheet} onClose={() => setActiveJobSheet(null)} />
      )}

      {activeLoadsheet && (
        <LoadsheetModal
          key={activeLoadsheet.id}
          row={records.find(r => r.id === activeLoadsheet.id) || activeLoadsheet}
          currentUser={currentUser}
          offlineMode={offlineMode}
          onUpdateShipment={handleUpdateShipment}
          onClose={() => setActiveLoadsheet(null)}
          isAdmin={isUserAdminCurrent()}
          activePort={selectedPort}
        />
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
                      const txt = "SW-P9VGV1E1NA";
                      if (navigator.clipboard?.writeText) {
                        navigator.clipboard.writeText(txt);
                      } else {
                        const textArea = document.createElement("textarea");
                        textArea.value = txt;
                        textArea.style.position = "fixed";
                        textArea.style.left = "-9999px";
                        document.body.appendChild(textArea);
                        textArea.focus();
                        textArea.select();
                        document.execCommand("copy");
                        document.body.removeChild(textArea);
                      }
                      setCopiedShareCode(true);
                      setTimeout(() => setCopiedShareCode(false), 2000);
                    }}
                    style={{ background: copiedShareCode ? "#16a34a" : "#0f172a", border: "none", color: "#ffffff", padding: "8px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer", transition: "all 0.15s ease" }}
                  >
                    {copiedShareCode ? "✓ Copied" : "Copy Code"}
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
                      const directJoinLink = "https://seaway-cargo-manifest.vercel.app/";
                      if (navigator.clipboard?.writeText) {
                        navigator.clipboard.writeText(directJoinLink);
                      } else {
                        const textArea = document.createElement("textarea");
                        textArea.value = directJoinLink;
                        textArea.style.position = "fixed";
                        textArea.style.left = "-9999px";
                        document.body.appendChild(textArea);
                        textArea.focus();
                        textArea.select();
                        document.execCommand("copy");
                        document.body.removeChild(textArea);
                      }
                      setCopiedDirectLink(true);
                      setTimeout(() => setCopiedDirectLink(false), 2000);
                    }}
                    style={{ 
                      width: "100%", 
                      background: copiedDirectLink ? "#15803d" : "#16a34a", 
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
                      gap: "6px",
                      transition: "all 0.15s ease"
                    }}
                  >
                    {copiedDirectLink ? "✓ Copied to Clipboard" : "🔗 Copy Direct Join Link"}
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
                          const directJoinLink = "https://seaway-cargo-manifest.vercel.app/";
                          
                          const subject = encodeURIComponent("Action Required: Join Live Cargo Scheduler Workspace");
                          const body = encodeURIComponent(
                            "Dear Ops Team,\n\nYou have been authorized to join our live cargo operations workspace so we can collaborate on cargo manifests, checklists, loadsheets, and flight schedules in real-time.\n\nPlease click the direct operations link below to join instantly:\n" + directJoinLink + "\n\nBest regards,\nOperations Dispatch Team"
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
                        value={adminAddPasscode}
                        onChange={(e) => setAdminAddPasscode(e.target.value)}
                        placeholder="Passcode"
                        style={{ width: "125px", padding: "8px 10px", fontSize: "12.5px", border: "1px solid #cbd5e1", borderRadius: "8px", boxSizing: "border-box", background: "#ffffff", color: "#0284c7", fontWeight: "extrabold", textAlign: "center" }}
                        title="Enter a custom password or login PIN for this workstation."
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
