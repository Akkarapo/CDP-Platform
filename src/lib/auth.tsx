import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export interface AuthUser {
  sub: string;
  name: string;
  email: string;
  picture: string;
}

const LS_KEY = "cdp.auth.user";
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

interface AuthContextValue {
  user: AuthUser | null;
  ready: boolean;
  clientIdConfigured: boolean;
  signOut: () => void;
  devSignIn: () => void; // dev-only fallback when no Google Client ID is configured
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Decode a Google ID token's payload without verifying the signature.
// ponytail: real production apps verify the token server-side (or with
// google-auth-library) before trusting it; this is a static SPA with no
// backend, so we trust the token Google's own script just handed us
// client-side. Add server verification when this gets an API layer.
function decodeIdToken(token: string): AuthUser | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return { sub: payload.sub, name: payload.name, email: payload.email, picture: payload.picture };
  } catch {
    return null;
  }
}

declare global {
  interface Window {
    google?: any;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  });
  const [ready, setReady] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (!CLIENT_ID) {
      setReady(true);
      return;
    }
    const existing = document.getElementById("google-identity-script");
    function init() {
      if (initialized.current || !window.google) return;
      initialized.current = true;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (resp: { credential: string }) => {
          const decoded = decodeIdToken(resp.credential);
          if (decoded) {
            setUser(decoded);
            localStorage.setItem(LS_KEY, JSON.stringify(decoded));
          }
        },
        auto_select: false,
      });
      setReady(true);
    }
    if (existing) {
      init();
      return;
    }
    const script = document.createElement("script");
    script.id = "google-identity-script";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = init;
    document.head.appendChild(script);
  }, []);

  function signOut() {
    setUser(null);
    localStorage.removeItem(LS_KEY);
    window.google?.accounts?.id?.disableAutoSelect?.();
  }

  function devSignIn() {
    const demo: AuthUser = { sub: "dev", name: "Demo User (dev mode)", email: "demo@localhost", picture: "" };
    setUser(demo);
    localStorage.setItem(LS_KEY, JSON.stringify(demo));
  }

  return (
    <AuthContext.Provider value={{ user, ready, clientIdConfigured: Boolean(CLIENT_ID), signOut, devSignIn }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// Renders Google's real "Sign in with Google" button into a div once the
// GIS script is ready. Kept as a small hook-driven component so Login.tsx
// stays declarative.
export function GoogleSignInButton() {
  const { ready, clientIdConfigured } = useAuth();
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ready && clientIdConfigured && divRef.current && window.google) {
      window.google.accounts.id.renderButton(divRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        width: 328,
        text: "signin_with",
      });
    }
  }, [ready, clientIdConfigured]);

  if (!clientIdConfigured) return null;
  return <div ref={divRef} />;
}
