import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "./supabase";

export interface AuthUser {
  sub: string;
  name: string;
  email: string;
  picture: string;
  expiresAt: number;
}

export type WorkspaceRole = "admin" | "editor" | "viewer";

interface GoogleIdTokenPayload {
  aud?: string;
  email?: string;
  email_verified?: boolean;
  exp?: number;
  iss?: string;
  name?: string;
  picture?: string;
  sub?: string;
}

const LS_KEY = "cdp.auth.user";
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as
  | string
  | undefined;

interface AuthContextValue {
  user: AuthUser | null;
  role: WorkspaceRole | null;
  canManageMembers: boolean;
  canEditCampaigns: boolean;
  // `ready`: the Supabase session restore has finished (resolves fast).
  // `googleReady`: the Google Identity Services script has loaded and
  // `initialize()` has run — this is what actually gates whether
  // `renderButton` can draw anything. They finish independently, so the
  // sign-in button must key off `googleReady`, not `ready`.
  ready: boolean;
  googleReady: boolean;
  error: string | null;
  clientIdConfigured: boolean;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readPayload(token: string): GoogleIdTokenPayload | null {
  try {
    const encoded = token.split(".")[1];

    if (!encoded) {
      return null;
    }

    const normalized = encoded
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const padded = normalized.padEnd(
      Math.ceil(normalized.length / 4) * 4,
      "="
    );

    // atob() คืนค่าเป็น binary string จึงต้องแปลงเป็น UTF-8
    // ก่อนนำไป JSON.parse เพื่อให้ชื่อภาษาไทยแสดงถูกต้อง
    const binary = atob(padded);

    const bytes = Uint8Array.from(
      binary,
      (character) => character.charCodeAt(0)
    );

    const decoded = new TextDecoder("utf-8").decode(bytes);

    return JSON.parse(decoded) as GoogleIdTokenPayload;
  } catch {
    return null;
  }
}

// Google Identity Services supplies this ID token. We check its important
// claims in the browser. A production API must also verify the signature
// server-side before authorizing protected data.
function decodeGoogleUser(token: string): AuthUser | null {
  const payload = readPayload(token);

  const issuerIsGoogle =
    payload?.iss === "https://accounts.google.com" ||
    payload?.iss === "accounts.google.com";

  const expiresAt = (payload?.exp ?? 0) * 1000;

  if (
    !payload?.sub ||
    !payload.email ||
    !payload.name ||
    !payload.email_verified ||
    payload.aud !== CLIENT_ID ||
    !issuerIsGoogle ||
    expiresAt <= Date.now()
  ) {
    return null;
  }

  return {
    sub: payload.sub,
    name: payload.name,
    email: payload.email,
    picture: payload.picture ?? "",
    expiresAt,
  };
}

function loadStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(LS_KEY);

    if (!raw) {
      return null;
    }

    const stored = JSON.parse(raw) as AuthUser;

    if (!stored.expiresAt || stored.expiresAt <= Date.now()) {
      localStorage.removeItem(LS_KEY);
      return null;
    }

    return stored;
  } catch {
    localStorage.removeItem(LS_KEY);
    return null;
  }
}

declare global {
  interface Window {
    google?: any;
  }
}

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [role, setRole] = useState<WorkspaceRole | null>(null);
  const [ready, setReady] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      const { data, error: sessionError } = await supabase.auth.getUser();

      if (!active) return;

      if (sessionError || !data.user) {
        localStorage.removeItem(LS_KEY);
        setUser(null);
        setRole(null);
        setReady(true);
        return;
      }

      const { data: membership, error: membershipError } = await supabase
        .from("workspace_members")
        .select("role")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (!active) return;

      if (membershipError || !membership) {
        await supabase.auth.signOut();
        localStorage.removeItem(LS_KEY);
        setUser(null);
        setRole(null);
        setReady(true);
        return;
      }

      const stored = loadStoredUser();
      const metadata = data.user.user_metadata;
      const restored: AuthUser = stored != null && stored.email === data.user.email
        ? stored
        : {
            sub: data.user.id,
            name: metadata.full_name ?? metadata.name ?? data.user.email ?? "ผู้ใช้",
            email: data.user.email ?? "",
            picture: metadata.avatar_url ?? metadata.picture ?? "",
            expiresAt: Date.now() + 60 * 60 * 1000,
          };

      setUser(restored);
      setRole(membership.role as WorkspaceRole);
      localStorage.setItem(LS_KEY, JSON.stringify(restored));
      setReady(true);
    }

    void restoreSession();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!CLIENT_ID) {
      return;
    }

    function init() {
      if (initialized.current || !window.google) {
        return;
      }

      initialized.current = true;

      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,

        callback: async (response: { credential?: string }) => {
          if (!response.credential) {
            setError("ไม่ได้รับข้อมูลยืนยันตัวตนจาก Google");
            return;
          }

          const googleUser = decodeGoogleUser(response.credential);

          if (!googleUser) {
            setError(
              "Google ไม่สามารถยืนยันบัญชีนี้ได้ กรุณาลองเข้าสู่ระบบอีกครั้ง"
            );
            return;
          }

          const { data: authData, error: signInError } =
            await supabase.auth.signInWithIdToken({
              provider: "google",
              token: response.credential,
            });

          if (signInError || !authData.user) {
            setError(
              signInError?.message ??
                "ไม่สามารถเข้าสู่ระบบ Supabase ได้"
            );
            return;
          }

          const { data: membership, error: membershipError } =
            await supabase
              .from("workspace_members")
              .select("role")
              .eq("user_id", authData.user.id)
              .maybeSingle();

          if (membershipError || !membership) {
            await supabase.auth.signOut();
            localStorage.removeItem(LS_KEY);
            setUser(null);
            setRole(null);
            setError("อีเมลนี้ยังไม่ได้รับเชิญให้เข้าใช้งานระบบ");
            return;
          }

          setError(null);
          setUser(googleUser);
          setRole(membership.role as WorkspaceRole);

          localStorage.setItem(
            LS_KEY,
            JSON.stringify(googleUser)
          );
        },

        auto_select: false,
        cancel_on_tap_outside: true,
      });

      setGoogleReady(true);
    }

    const existing = document.getElementById(
      "google-identity-script"
    ) as HTMLScriptElement | null;

    if (existing) {
      if (window.google) {
        init();
      } else {
        existing.addEventListener("load", init, {
          once: true,
        });
      }

      return () => {
        existing.removeEventListener("load", init);
      };
    }

    const script = document.createElement("script");

    script.id = "google-identity-script";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = init;

    script.onerror = () => {
      setError(
        "โหลด Google Sign-In ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วรีเฟรชหน้า"
      );
    };

    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!user || user.sub === "dev") {
      return;
    }

    const delay = Math.max(
      0,
      user.expiresAt - Date.now()
    );

    const timer = window.setTimeout(() => {
      setUser(null);
      localStorage.removeItem(LS_KEY);
    }, Math.min(delay, 2_147_483_647));

    return () => {
      window.clearTimeout(timer);
    };
  }, [user]);

  function signOut() {
    void supabase.auth.signOut();
    setUser(null);
    setRole(null);
    setError(null);
    localStorage.removeItem(LS_KEY);

    window.google?.accounts?.id?.disableAutoSelect?.();
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        canManageMembers: role === "admin",
        canEditCampaigns: role === "admin" || role === "editor",
        ready,
        googleReady,
        error,
        clientIdConfigured: Boolean(CLIENT_ID),
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used within AuthProvider"
    );
  }

  return context;
}

export function GoogleSignInButton() {
  const { googleReady, clientIdConfigured } = useAuth();
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (
      googleReady &&
      clientIdConfigured &&
      divRef.current &&
      window.google
    ) {
      divRef.current.replaceChildren();

      window.google.accounts.id.renderButton(
        divRef.current,
        {
          type: "standard",
          theme: "outline",
          size: "large",
          width: 328,
          text: "signin_with",
          shape: "rectangular",
        }
      );
    }
  }, [googleReady, clientIdConfigured]);

  if (!clientIdConfigured) {
    return null;
  }

  return (
    <div
      ref={divRef}
      aria-label="เข้าสู่ระบบด้วย Google"
    />
  );
}
