import { useState } from "react";
import { useAuth } from "../lib/auth";

type Role = "Admin" | "Editor" | "Viewer";
interface TeamMember { id: number; name: string; email: string; avatar: string; role: Role; isYou?: boolean }

const ROLE_META: Record<Role, { bg: string; color: string }> = {
  Admin: { bg: "#1A1917", color: "#ffffff" },
  Editor: { bg: "#E0E7FF", color: "#3730A3" },
  Viewer: { bg: "#F3F4F6", color: "#6B7280" },
};

function SectionCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>{children}</div>;
}
function CardHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="px-6 py-5" style={{ borderBottom: "1px solid var(--color-rule)" }}>
      <p className="text-sm font-semibold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>{title}</p>
      {description && <p className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>{description}</p>}
    </div>
  );
}
function Field({ label, value, onChange, placeholder, mono = false }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium" style={{ color: "var(--color-ink-2)", display: "block" }}>{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none"
        style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)", color: "var(--color-ink)", fontFamily: mono ? "monospace" : "var(--font-sans)" }}
      />
    </div>
  );
}

function InviteModal({ onClose, onInvite }: { onClose: () => void; onInvite: (name: string, email: string, role: Role) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("Editor");
  const valid = name.trim() && email.includes("@");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(26,25,23,0.4)", backdropFilter: "blur(3px)" }} onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid var(--color-rule)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>เชิญสมาชิกใหม่</p>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: "var(--color-ink-3)", background: "none", border: "none", cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <Field label="ชื่อ-นามสกุล" value={name} onChange={setName} placeholder="สมชาย ใจดี" />
          <Field label="อีเมล" value={email} onChange={setEmail} placeholder="somchai@company.co.th" />
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--color-ink-2)", display: "block" }}>Role</label>
            <div className="flex gap-2">
              {(["Admin", "Editor", "Viewer"] as Role[]).map((r) => {
                const active = role === r;
                const m = ROLE_META[r];
                return (
                  <button key={r} onClick={() => setRole(r)} className="flex-1 py-2 rounded-xl text-xs font-medium" style={{ backgroundColor: active ? m.bg : "var(--color-ground)", color: active ? m.color : "var(--color-ink-2)", border: `1.5px solid ${active ? m.bg : "var(--color-rule)"}`, cursor: "pointer" }}>{r}</button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="px-6 pb-5">
          <button onClick={() => { if (valid) { onInvite(name, email, role); onClose(); } }} disabled={!valid} className="w-full py-2.5 rounded-xl text-sm font-medium" style={{ backgroundColor: valid ? "var(--color-ink)" : "var(--color-ground)", color: valid ? "#fff" : "var(--color-ink-3)", border: "none", cursor: valid ? "pointer" : "not-allowed" }}>ส่งคำเชิญ</button>
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();

  const [posKey, setPosKey] = useState(() => localStorage.getItem("cdp.posKey") ?? "");
  const [posEndpoint, setPosEndpoint] = useState(() => localStorage.getItem("cdp.posEndpoint") ?? "");
  const [lineToken, setLineToken] = useState(() => localStorage.getItem("cdp.lineToken") ?? "");
  const [saved, setSaved] = useState<string | null>(null);

  const [team, setTeam] = useState<TeamMember[]>(() =>
    user ? [{ id: 1, name: user.name, email: user.email, avatar: user.name[0] ?? "U", role: "Admin", isYou: true }] : []
  );
  const [inviteOpen, setInviteOpen] = useState(false);

  function save(key: string, value: string, label: string) {
    localStorage.setItem(key, value);
    setSaved(label);
    setTimeout(() => setSaved(null), 2000);
  }

  function handleInvite(name: string, email: string, role: Role) {
    const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2);
    setTeam((prev) => [...prev, { id: Date.now(), name, email, avatar: initials, role }]);
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-8 space-y-5">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>Settings</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--color-ink-3)" }}>จัดการการตั้งค่าและการเชื่อมต่อระบบ</p>
      </div>

      <SectionCard>
        <CardHeader title="บัญชี Google" description="บัญชีที่ใช้เข้าสู่ระบบอยู่ในขณะนี้" />
        <div className="px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {user?.picture ? (
              <img src={user.picture} alt="" className="w-11 h-11 rounded-full flex-shrink-0" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0" style={{ backgroundColor: "var(--color-ink)", color: "#fff" }}>{user?.name?.[0] ?? "?"}</div>
            )}
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>{user?.name ?? "ไม่ทราบชื่อ"}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>{user?.email}</p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <svg width="12" height="12" viewBox="0 0 18 18" fill="none">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4" />
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
                  <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
                </svg>
                <span className="text-xs" style={{ color: "var(--color-ink-3)" }}>เชื่อมต่อกับ Google แล้ว</span>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <CardHeader title="POS API" description="ยังไม่ได้เชื่อมต่อจริง — ต้องมี backend รับ webhook/credential จึงจะดึงข้อมูลอัตโนมัติได้ ค่าที่กรอกที่นี่จะถูกบันทึกไว้ในเบราว์เซอร์เท่านั้น" />
        <div className="px-6 py-5 space-y-4">
          <Field label="API Key" value={posKey} onChange={setPosKey} placeholder="sk_live_…" mono />
          <Field label="Endpoint URL" value={posEndpoint} onChange={setPosEndpoint} placeholder="https://…" mono />
          <div className="flex items-center gap-3 pt-1">
            <button onClick={() => { save("cdp.posKey", posKey, "pos"); save("cdp.posEndpoint", posEndpoint, "pos"); }} className="px-4 py-2 rounded-xl text-sm font-medium" style={{ backgroundColor: saved === "pos" ? "#DCFCE7" : "var(--color-ink)", color: saved === "pos" ? "#166534" : "#fff", border: "none", cursor: "pointer" }}>
              {saved === "pos" ? "บันทึกแล้ว" : "บันทึก"}
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <CardHeader title="LINE Official Account" description="ยังไม่ได้เชื่อมต่อจริง — ค่าที่กรอกที่นี่จะถูกบันทึกไว้ในเบราว์เซอร์เท่านั้น" />
        <div className="px-6 py-5 space-y-4">
          <Field label="Channel Access Token" value={lineToken} onChange={setLineToken} placeholder="…" mono />
          <button onClick={() => save("cdp.lineToken", lineToken, "line")} className="px-4 py-2 rounded-xl text-sm font-medium" style={{ backgroundColor: saved === "line" ? "#DCFCE7" : "var(--color-ink)", color: saved === "line" ? "#166534" : "#fff", border: "none", cursor: "pointer" }}>
            {saved === "line" ? "บันทึกแล้ว" : "บันทึก"}
          </button>
        </div>
      </SectionCard>

      <SectionCard>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid var(--color-rule)" }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>จัดการทีม</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>{team.length} สมาชิก</p>
          </div>
          <button onClick={() => setInviteOpen(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium" style={{ backgroundColor: "var(--color-ink)", color: "#fff", border: "none", cursor: "pointer" }}>
            เชิญสมาชิก
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-rule)" }}>
              {["สมาชิก", "อีเมล", "Role"].map((h, i) => (
                <th key={h} className={`px-5 py-3 text-xs font-medium tracking-wide uppercase ${i === 2 ? "text-right" : "text-left"}`} style={{ color: "var(--color-ink-3)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {team.map((m, i) => {
              const rm = ROLE_META[m.role];
              return (
                <tr key={m.id} style={{ borderBottom: i < team.length - 1 ? "1px solid var(--color-rule)" : "none" }}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0" style={{ backgroundColor: "var(--color-ink)", color: "#fff" }}>{m.avatar}</div>
                      <div>
                        <span className="font-medium" style={{ color: "var(--color-ink)" }}>{m.name}</span>
                        {m.isYou && <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--color-ground)", color: "var(--color-ink-3)", border: "1px solid var(--color-rule)" }}>คุณ</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-xs" style={{ color: "var(--color-ink-2)" }}>{m.email}</td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: rm.bg, color: rm.color }}>{m.role}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SectionCard>

      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} onInvite={handleInvite} />}
    </main>
  );
}
