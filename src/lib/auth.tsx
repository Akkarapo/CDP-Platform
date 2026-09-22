import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface AuthUser {
  sub: string;
  name: string;
  email: string;
  picture: string;
  expiresAt: number;
}

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
  ready: boolean;
  error: string | null;
  clientIdConfigured: boolean;
  signOut: () => void;
  devSignIn: () => void;
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
  const [user, setUser] = useState<AuthUser | null>(loadStoredUser);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!CLIENT_ID) {
      setReady(true);
      return;
    }

    function init() {
      if (initialized.current || !window.google) {
        return;
      }

      initialized.current = true;

      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,

        callback: (response: { credential?: string }) => {
          const googleUser = response.credential
            ? decodeGoogleUser(response.credential)
            : null;

          if (!googleUser) {
            setError(
              "Google ไม่สามารถยืนยันบัญชีนี้ได้ กรุณาลองเข้าสู่ระบบอีกครั้ง"
            );
            return;
          }

          setError(null);
          setUser(googleUser);

          localStorage.setItem(
            LS_KEY,
            JSON.stringify(googleUser)
          );
        },

        auto_select: false,
        cancel_on_tap_outside: true,
      });

      setReady(true);
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
      setReady(true);
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
    setUser(null);
    setError(null);
    localStorage.removeItem(LS_KEY);

    window.google?.accounts?.id?.disableAutoSelect?.();
  }

  function devSignIn() {
    const demo: AuthUser = {
      sub: "dev",
      name: "Demo User (dev mode)",
      email: "demo@localhost",
      picture: "",
      expiresAt: Date.now() + 8 * 60 * 60 * 1000,
    };

    setUser(demo);

    localStorage.setItem(
      LS_KEY,
      JSON.stringify(demo)
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        ready,
        error,
        clientIdConfigured: Boolean(CLIENT_ID),
        signOut,
        devSignIn,
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
  const { ready, clientIdConfigured } = useAuth();
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (
      ready &&
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
  }, [ready, clientIdConfigured]);

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