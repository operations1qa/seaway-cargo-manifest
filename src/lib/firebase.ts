import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Services
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Error Types and Standard Operations Loggers
export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

// Global interceptors to catch Quota Exceeded (resource-exhausted) errors from Firestore
// and trigger Offline Safeguard Mode automatically while suppressing internal library noise.
if (typeof window !== "undefined") {
  let lastDispatched = 0;
  const dispatchQuotaError = (msg: string) => {
    const now = Date.now();
    if (now - lastDispatched > 2000) {
      lastDispatched = now;
      const ev = new CustomEvent("seaway-firebase-error", { detail: msg });
      window.dispatchEvent(ev);
    }
  };

  // Intercept console.error to check for Firebase SDK's internal quota warning logs
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    const msg = args
      .map((arg) => {
        if (arg instanceof Error) {
          return arg.stack || arg.message || String(arg);
        }
        if (typeof arg === "object" && arg !== null) {
          try {
            return JSON.stringify(arg);
          } catch (_) {
            return String(arg);
          }
        }
        return String(arg);
      })
      .join(" ");

    const hasQuotaError =
      msg.toLowerCase().includes("resource-exhausted") ||
      msg.toLowerCase().includes("quota limit exceeded") ||
      msg.toLowerCase().includes("quota exceeded") ||
      msg.toLowerCase().includes("free daily write units") ||
      msg.toLowerCase().includes("maximum backoff delay to prevent overloading");

    if (hasQuotaError) {
      dispatchQuotaError("Quota limit exceeded (resource-exhausted)");
      // Suppress the noisy Firebase SDK internal error logs from polluting the console
      return;
    }

    originalConsoleError.apply(console, args);
  };

  // Intercept unhandled promise rejections
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const msg = reason instanceof Error ? reason.stack || reason.message : String(reason);

    const hasQuotaError =
      msg.toLowerCase().includes("resource-exhausted") ||
      msg.toLowerCase().includes("quota limit exceeded") ||
      msg.toLowerCase().includes("quota exceeded") ||
      msg.toLowerCase().includes("free daily write units");

    if (hasQuotaError) {
      dispatchQuotaError("Quota limit exceeded (resource-exhausted)");
      event.preventDefault(); // Prevent standard console log/crash
    }
  });

  // Intercept window errors
  window.addEventListener("error", (event) => {
    const msg = event.message || "";
    const hasQuotaError =
      msg.toLowerCase().includes("resource-exhausted") ||
      msg.toLowerCase().includes("quota limit exceeded") ||
      msg.toLowerCase().includes("quota exceeded") ||
      msg.toLowerCase().includes("free daily write units");

    if (hasQuotaError) {
      dispatchQuotaError("Quota limit exceeded (resource-exhausted)");
      event.preventDefault(); // Prevent standard console log/crash
    }
  });
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  
  const isQuotaError =
    errorMessage.toLowerCase().includes("resource-exhausted") ||
    errorMessage.toLowerCase().includes("quota limit exceeded") ||
    errorMessage.toLowerCase().includes("quota exceeded") ||
    errorMessage.toLowerCase().includes("free daily write units");

  if (isQuotaError) {
    if (typeof window !== "undefined") {
      const ev = new CustomEvent("seaway-firebase-error", { detail: "Quota limit exceeded (resource-exhausted)" });
      window.dispatchEvent(ev);
    }
    return;
  }

  console.error("Firestore Error: ", JSON.stringify(errInfo));
  
  if (typeof window !== "undefined") {
    const ev = new CustomEvent("seaway-firebase-error", { detail: errorMessage });
    window.dispatchEvent(ev);
  }
}
