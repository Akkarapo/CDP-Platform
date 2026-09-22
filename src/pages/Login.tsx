import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth, GoogleSignInButton } from "../lib/auth";

export default function Login() {
  const navigate = useNavigate();
  const { user, ready, error, clientIdConfigured } = useAuth();

  useEffect(() => {
    if (user) navigate("/dashboard");
  }, [user, navigate]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "var(--color-ground)", fontFamily: "var(--font-sans)" }}
    >
      <div className="w-full max-w-[380px]">
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-11 h-11 rounded-xl mb-5"
            style={{ backgroundColor: "var(--color-ink)" }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="3.5" fill="white" />
              <circle cx="10" cy="10" r="7" stroke="white" strokeWidth="1.5" fill="none" opacity="0.4" />
              <circle cx="10" cy="10" r="9.5" stroke="white" strokeWidth="1" fill="none" opacity="0.2" />
            </svg>
          </div>
          <h1
            className="text-2xl tracking-tight mb-1"
            style={{ fontFamily: "var(--font-serif)", color: "var(--color-ink)" }}
          >
            CDP Platform
          </h1>
          <p className="text-sm" style={{ color: "var(--color-ink-2)" }}>
            Customer Data Platform
          </p>
        </div>

        <div
          className="rounded-2xl px-8 py-9"
          style={{
            backgroundColor: "var(--color-surface)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 24px rgba(0,0,0,0.07)",
            border: "1px solid var(--color-rule)",
          }}
        >
          <h2 className="text-lg font-medium mb-1.5" style={{ color: "var(--color-ink)" }}>
            Sign in
          </h2>
          <p className="text-sm mb-7" style={{ color: "var(--color-ink-2)" }}>
            Use your Google account to continue
          </p>

          {clientIdConfigured ? (
            <div className="space-y-3">
              {!ready && (
                <p className="text-sm text-center" style={{ color: "var(--color-ink-3)" }}>
                  กำลังโหลด Google Sign-In…
                </p>
              )}
              <div className="flex justify-center">
                <GoogleSignInButton />
              </div>
              {error && (
                <p
                  role="alert"
                  className="text-xs leading-relaxed rounded-xl px-3.5 py-3"
                  style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}
                >
                  {error}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p
                className="text-xs leading-relaxed rounded-xl px-3.5 py-3"
                style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}
              >
                ยังไม่ได้ตั้งค่า Google OAuth Client ID — เพิ่มตัวแปร <code>VITE_GOOGLE_CLIENT_ID</code> ใน
                environment variables (ดูวิธีตั้งค่าใน README) เพื่อเปิดใช้งานการเข้าสู่ระบบด้วย Google จริง
              </p>
            </div>
          )}

          <div className="mt-7 pt-5" style={{ borderTop: "1px solid var(--color-rule)" }}>
            <p className="text-xs text-center leading-relaxed" style={{ color: "var(--color-ink-3)" }}>
              เข้าใช้งานได้เฉพาะบัญชีที่ได้รับสิทธิ์เท่านั้น
              <br />
              หากต้องการสิทธิ์เข้าใช้งาน กรุณาติดต่อผู้ดูแลระบบ
            </p>
          </div>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "var(--color-ink-3)" }}>
          &copy; {new Date().getFullYear()} CDP Platform
        </p>
      </div>
    </div>
  );
}
