import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth, type WorkspaceRole } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { useData, MOCK_POS_KEY, MOCK_POS_ENDPOINT, MOCK_POS_TX_PREFIX, MOCK_POS_CUSTOMER_PREFIX } from "../lib/store";

type TeamEntry = { id: string; name: string; email: string; role: WorkspaceRole; status: "active" | "pending"; isYou?: boolean };

const ROLE_META: Record<WorkspaceRole, { label: string; bg: string; color: string }> = {
  admin: { label: "Admin", bg: "#1A1917", color: "#ffffff" },
  editor: { label: "Editor", bg: "#E0E7FF", color: "#3730A3" },
  viewer: { label: "Viewer", bg: "#F3F4F6", color: "#6B7280" },
};

function SectionCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)" }}>{children}</div>;
}

function Field({ label, value, onChange, placeholder, mono = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; mono?: boolean }) {
  return <div className="space-y-1.5"><label className="text-xs font-medium" style={{ color: "var(--color-ink-2)", display: "block" }}>{label}</label><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)", color: "var(--color-ink)", fontFamily: mono ? "monospace" : "var(--font-sans)" }} /></div>;
}

function InviteModal({ onClose, onInvited }: { onClose: () => void; onInvited: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("editor");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = email.trim().includes("@");

  async function submit() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    const { error: inviteError } = await supabase.rpc("invite_workspace_member", {
      p_email: email.trim(),
      p_display_name: name.trim(),
      p_role: role,
    });
    if (inviteError) {
      setError(inviteError.code === "23505" ? "อีเมลนี้ถูกเพิ่มไว้แล้ว" : inviteError.message); setSaving(false); return;
    }
    await onInvited();
    onClose();
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div className="absolute inset-0" style={{ backgroundColor: "rgba(26,25,23,0.4)", backdropFilter: "blur(3px)" }} onClick={onClose} />
    <div className="relative w-full max-w-sm rounded-2xl" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
      <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid var(--color-rule)" }}><p className="text-sm font-semibold">เชิญสมาชิกใหม่</p><button onClick={onClose} aria-label="ปิด" className="text-xl" style={{ color: "var(--color-ink-3)", background: "none", border: "none", cursor: "pointer" }}>×</button></div>
      <div className="px-6 py-5 space-y-4">
        <Field label="ชื่อ-นามสกุล (ไม่บังคับ)" value={name} onChange={setName} placeholder="สมชาย ใจดี" />
        <Field label="อีเมล" value={email} onChange={setEmail} placeholder="somchai@company.co.th" />
        <div className="space-y-1.5"><label className="text-xs font-medium" style={{ color: "var(--color-ink-2)", display: "block" }}>Role</label><div className="flex gap-2">
          {(Object.keys(ROLE_META) as WorkspaceRole[]).map((item) => { const active = role === item; const meta = ROLE_META[item]; return <button key={item} onClick={() => setRole(item)} className="flex-1 py-2 rounded-xl text-xs font-medium" style={{ backgroundColor: active ? meta.bg : "var(--color-ground)", color: active ? meta.color : "var(--color-ink-2)", border: `1.5px solid ${active ? meta.bg : "var(--color-rule)"}`, cursor: "pointer" }}>{meta.label}</button>; })}
        </div></div>
        {error && <p role="alert" className="text-xs" style={{ color: "#991B1B" }}>{error}</p>}
      </div>
      <div className="px-6 pb-5"><button onClick={() => void submit()} disabled={!valid || saving} className="w-full py-2.5 rounded-xl text-sm font-medium" style={{ backgroundColor: valid && !saving ? "var(--color-ink)" : "var(--color-ground)", color: valid && !saving ? "#fff" : "var(--color-ink-3)", border: "none", cursor: valid && !saving ? "pointer" : "not-allowed" }}>{saving ? "กำลังเพิ่ม…" : "เพิ่มสมาชิก"}</button></div>
    </div>
  </div>;
}

export default function Settings() {
  const { user, role, canManageMembers } = useAuth();
  const { customers, rawCustomers, rawTransactions, posConnected, connectPos, resetPos } = useData();

  const [posKey, setPosKey] = useState(() => localStorage.getItem("cdp.posKey") ?? "");
  const [posEndpoint, setPosEndpoint] = useState(() => localStorage.getItem("cdp.posEndpoint") ?? "");
  const [posError, setPosError] = useState<string | null>(null);
  const [lineToken, setLineToken] = useState(() => localStorage.getItem("cdp.lineToken") ?? "");
  const [saved, setSaved] = useState<string | null>(null);

  const [team, setTeam] = useState<TeamEntry[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const loadTeam = useCallback(async () => {
    if (!canManageMembers) return;
    setLoadingTeam(true); setTeamError(null);
    const [membersResult, invitationsResult] = await Promise.all([
      supabase.from("workspace_members").select("user_id,email,role,display_name").order("joined_at"),
      supabase.from("workspace_invitations").select("id,email,role,display_name,status").eq("status", "pending").order("created_at"),
    ]);
    if (membersResult.error || invitationsResult.error) {
      setTeamError(membersResult.error?.message ?? invitationsResult.error?.message ?? "โหลดสมาชิกไม่สำเร็จ"); setLoadingTeam(false); return;
    }
    const members: TeamEntry[] = (membersResult.data ?? []).map((member) => ({ id: member.user_id, name: member.display_name || member.email.split("@")[0], email: member.email, role: member.role as WorkspaceRole, status: "active", isYou: member.email.toLowerCase() === user?.email.toLowerCase() }));
    const pending: TeamEntry[] = (invitationsResult.data ?? []).map((invite) => ({ id: invite.id, name: invite.display_name || invite.email.split("@")[0], email: invite.email, role: invite.role as WorkspaceRole, status: "pending" }));
    setTeam([...members, ...pending]); setLoadingTeam(false);
  }, [canManageMembers, user?.email]);

  useEffect(() => { void loadTeam(); }, [loadTeam]);

  async function changeRole(entry: TeamEntry, nextRole: WorkspaceRole) {
    setTeamError(null);
    const table = entry.status === "active" ? "workspace_members" : "workspace_invitations";
    const key = entry.status === "active" ? "user_id" : "id";
    const { error } = await supabase.from(table).update({ role: nextRole }).eq(key, entry.id);
    if (error) { setTeamError(error.message); return; }
    await loadTeam();
  }

  async function removeMember(entry: TeamEntry) {
    if (!window.confirm(`ลบ ${entry.name} ออกจากทีม?`)) return;
    setTeamError(null);
    const table = entry.status === "active" ? "workspace_members" : "workspace_invitations";
    const key = entry.status === "active" ? "user_id" : "id";
    const { error } = await supabase.from(table).delete().eq(key, entry.id);
    if (error) { setTeamError(error.message); return; }
    await loadTeam();
  }

  // Derived straight from the shared data (not local state) so the log
  // survives navigating away from and back to this page — the simulator
  // itself runs at the app root, this page is only a viewer onto it.
  const mockTransactions = useMemo(
    () => rawTransactions.filter((t) => t.transaction_id.startsWith(MOCK_POS_TX_PREFIX)),
    [rawTransactions]
  );
  const mockCustomerCount = useMemo(
    () => rawCustomers.filter((c) => c.customer_id.startsWith(MOCK_POS_CUSTOMER_PREFIX)).length,
    [rawCustomers]
  );
  const recentLog = useMemo(() => {
    const byId = new Map(customers.map((c) => [c.id, c.name]));
    return mockTransactions.slice(-5).reverse().map((t) => ({
      id: t.transaction_id,
      text: `${byId.get(t.customer_id) ?? t.customer_id} · ${t.product_name} × ${t.quantity} · ฿${Number(t.line_total).toLocaleString("th-TH")}`,
      time: t.purchase_datetime,
    }));
  }, [mockTransactions, customers]);

  function save(key: string, value: string, label: string) {
    localStorage.setItem(key, value);
    setSaved(label);
    setTimeout(() => setSaved(null), 2000);
  }

  function handleConnectPos() {
    if (connectPos(posKey, posEndpoint)) {
      setPosError(null);
    } else {
      setPosError("API Key หรือ Endpoint URL ไม่ถูกต้อง — ดูค่าสำหรับทดลองระบบจำลองด้านล่าง");
    }
  }

  function handleResetPos() {
    resetPos();
    setPosKey("");
    setPosEndpoint("");
    setPosError(null);
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-8 space-y-5">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>Settings</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--color-ink-3)" }}>จัดการการตั้งค่า การเชื่อมต่อระบบ และสิทธิ์สมาชิก</p>
      </div>

      <SectionCard>
        <div className="px-6 py-5" style={{ borderBottom: "1px solid var(--color-rule)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>บัญชี Google</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>บัญชีที่ใช้เข้าสู่ระบบอยู่ในขณะนี้</p>
        </div>
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
              {role && <span className="inline-flex mt-2 px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: ROLE_META[role].bg, color: ROLE_META[role].color }}>{ROLE_META[role].label}</span>}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <div className="px-6 py-5" style={{ borderBottom: "1px solid var(--color-rule)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>POS API</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>ยังไม่ได้เชื่อมต่อจริง — ระบบจำลองการเชื่อมต่อไว้ให้ทดลอง เมื่อกรอกค่าที่ถูกต้องแล้ว จะเริ่มสุ่มสร้างรายการซื้อของลูกค้าจริงในระบบทุก 3 วินาที เหมือนข้อมูลจาก POS จริง</p>
        </div>
        {!posConnected ? (
          <div className="px-6 py-5 space-y-4">
            <Field label="API Key" value={posKey} onChange={setPosKey} placeholder="sk_live_…" mono />
            <Field label="Endpoint URL" value={posEndpoint} onChange={setPosEndpoint} placeholder="https://…" mono />
            {posError && (
              <p role="alert" className="text-xs leading-relaxed rounded-xl px-3.5 py-3" style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}>{posError}</p>
            )}
            <div className="rounded-xl px-3.5 py-3" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)" }}>
              <p className="text-xs mb-1.5" style={{ color: "var(--color-ink-3)" }}>สำหรับทดลองระบบจำลอง ใช้ค่านี้:</p>
              <p className="text-xs font-mono" style={{ color: "var(--color-ink-2)" }}>API Key: {MOCK_POS_KEY}</p>
              <p className="text-xs font-mono mt-0.5" style={{ color: "var(--color-ink-2)" }}>Endpoint: {MOCK_POS_ENDPOINT}</p>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button onClick={handleConnectPos} className="px-4 py-2 rounded-xl text-sm font-medium" style={{ backgroundColor: "var(--color-ink)", color: "#fff", border: "none", cursor: "pointer" }}>
                เชื่อมต่อ
              </button>
            </div>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: "#DCFCE7", color: "#166534" }}>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#166534" }} />
                เชื่อมต่อแล้ว — กำลังจำลองรายการซื้อทุก 3 วินาที
              </span>
              <button onClick={handleResetPos} className="text-xs font-medium px-3 py-1.5 rounded-lg" style={{ backgroundColor: "var(--color-ground)", color: "var(--color-ink-2)", border: "1px solid var(--color-rule)", cursor: "pointer" }}>
                รีเซ็ต
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl px-4 py-3" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)" }}>
                <p className="text-xs" style={{ color: "var(--color-ink-3)" }}>รายการซื้อที่จำลองมาแล้ว</p>
                <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>{mockTransactions.length.toLocaleString("th-TH")} รายการ</p>
              </div>
              <div className="rounded-xl px-4 py-3" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)" }}>
                <p className="text-xs" style={{ color: "var(--color-ink-3)" }}>ลูกค้าใหม่ที่จำลองมาแล้ว</p>
                <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>{mockCustomerCount.toLocaleString("th-TH")} คน</p>
              </div>
            </div>
            {recentLog.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: "var(--color-ink-2)" }}>ล่าสุด</p>
                <div className="space-y-1.5">
                  {recentLog.map((l) => (
                    <div key={l.id} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: "var(--color-ground)" }}>
                      <span style={{ color: "var(--color-ink)" }}>{l.text}</span>
                      <span className="flex-shrink-0 ml-3" style={{ color: "var(--color-ink-3)" }}>{l.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </SectionCard>

      <SectionCard>
        <div className="px-6 py-5" style={{ borderBottom: "1px solid var(--color-rule)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>LINE Official Account</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>ยังไม่ได้เชื่อมต่อจริง — ค่าที่กรอกที่นี่จะถูกบันทึกไว้ในเบราว์เซอร์เท่านั้น</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <Field label="Channel Access Token" value={lineToken} onChange={setLineToken} placeholder="…" mono />
          <button onClick={() => save("cdp.lineToken", lineToken, "line")} className="px-4 py-2 rounded-xl text-sm font-medium" style={{ backgroundColor: saved === "line" ? "#DCFCE7" : "var(--color-ink)", color: saved === "line" ? "#166534" : "#fff", border: "none", cursor: "pointer" }}>
            {saved === "line" ? "บันทึกแล้ว" : "บันทึก"}
          </button>
        </div>
      </SectionCard>

      {canManageMembers ? <SectionCard>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid var(--color-rule)" }}><div><p className="text-sm font-semibold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>จัดการทีม</p><p className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>{team.length} รายการ</p></div><button onClick={() => setInviteOpen(true)} className="px-4 py-2 rounded-xl text-sm font-medium" style={{ backgroundColor: "var(--color-ink)", color: "#fff", border: "none", cursor: "pointer" }}>เชิญสมาชิก</button></div>
        {teamError && <p role="alert" className="mx-5 mt-4 text-xs" style={{ color: "#991B1B" }}>{teamError}</p>}
        {loadingTeam ? <p className="px-6 py-8 text-sm" style={{ color: "var(--color-ink-3)" }}>กำลังโหลดสมาชิก…</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr style={{ borderBottom: "1px solid var(--color-rule)" }}>
          {["สมาชิก", "สถานะ", "Role", ""].map((heading, index) => <th key={`${heading}-${index}`} className={`px-5 py-3 text-xs font-medium ${index === 3 ? "text-right" : "text-left"}`} style={{ color: "var(--color-ink-3)" }}>{heading}</th>)}
        </tr></thead><tbody>
          {team.map((member, index) => {
            const canRemove = !member.isYou && member.role !== "admin";
            return <tr key={`${member.status}-${member.id}`} style={{ borderBottom: index < team.length - 1 ? "1px solid var(--color-rule)" : "none" }}>
              <td className="px-5 py-3.5"><p className="font-medium">{member.name}{member.isYou && <span className="ml-2 text-xs" style={{ color: "var(--color-ink-3)" }}>(คุณ)</span>}</p><p className="text-xs" style={{ color: "var(--color-ink-3)" }}>{member.email}</p></td>
              <td className="px-5 py-3.5"><span className="text-xs" style={{ color: member.status === "active" ? "#166534" : "#92400E" }}>{member.status === "active" ? "ใช้งานแล้ว" : "รอล็อกอินครั้งแรก"}</span></td>
              <td className="px-5 py-3.5">
                <div className="relative inline-block">
                  <select
                    aria-label={`Role ของ ${member.email}`}
                    value={member.role}
                    onChange={(event) => void changeRole(member, event.target.value as WorkspaceRole)}
                    disabled={member.isYou}
                    className="appearance-none rounded-full pl-3.5 pr-8 py-1.5 text-xs font-medium outline-none"
                    style={{ backgroundColor: ROLE_META[member.role].bg, color: ROLE_META[member.role].color, border: "none", cursor: member.isYou ? "not-allowed" : "pointer" }}
                  >
                    {(Object.keys(ROLE_META) as WorkspaceRole[]).map((item) => <option key={item} value={item}>{ROLE_META[item].label}</option>)}
                  </select>
                  <svg className="pointer-events-none absolute" style={{ right: "10px", top: "50%", transform: "translateY(-50%)" }} width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 3.5L5 6.5L8 3.5" stroke={ROLE_META[member.role].color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </td>
              <td className="px-5 py-3.5 text-right">
                {canRemove && <button onClick={() => void removeMember(member)} aria-label={`ลบ ${member.name}`} className="text-xs font-medium rounded-full px-3 py-1.5" style={{ color: "#991B1B", backgroundColor: "transparent", border: "1px solid var(--color-rule)", cursor: "pointer" }}>ลบ</button>}
              </td>
            </tr>;
          })}
        </tbody></table></div>}
      </SectionCard> : <SectionCard><div className="px-6 py-5"><p className="text-sm font-semibold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>สิทธิ์สมาชิก</p><p className="text-sm mt-2" style={{ color: "var(--color-ink-2)" }}>เฉพาะ Admin เท่านั้นที่เพิ่มสมาชิกและกำหนด Role ได้</p></div></SectionCard>}

      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} onInvited={loadTeam} />}
    </main>
  );
}
