import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth, type WorkspaceRole } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { useData, MOCK_POS_KEY, MOCK_POS_ENDPOINT, MOCK_POS_TX_PREFIX, MOCK_POS_CUSTOMER_PREFIX } from "../lib/store";

type TeamEntry = { id: string; name: string; email: string; role: WorkspaceRole; status: "active" | "pending"; isYou?: boolean };
type LineSegment = "Premium" | "Regular" | "New" | "Dormant";
type LineUserRow = { line_user_id: string; display_name: string | null; picture_url: string | null; last_message_text: string | null; last_message_at: string | null; followed: boolean; is_admin: boolean; segment: LineSegment | null };
const LINE_SEGMENTS: LineSegment[] = ["Premium", "Regular", "New", "Dormant"];

const ROLE_META: Record<WorkspaceRole, { label: string; bg: string; color: string }> = {
  super_admin: { label: "Super Admin", bg: "#7C2D12", color: "#ffffff" },
  admin: { label: "Admin", bg: "#1A1917", color: "#ffffff" },
  editor: { label: "Editor", bg: "#E0E7FF", color: "#3730A3" },
  viewer: { label: "Viewer", bg: "#F3F4F6", color: "#6B7280" },
};
// super_admin is never picked from a dropdown or invite — it only moves
// via the explicit transfer action, which demotes the sender atomically.
const ASSIGNABLE_ROLES: WorkspaceRole[] = ["admin", "editor", "viewer"];

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
          {ASSIGNABLE_ROLES.map((item) => { const active = role === item; const meta = ROLE_META[item]; return <button key={item} onClick={() => setRole(item)} className="flex-1 py-2 rounded-xl text-xs font-medium" style={{ backgroundColor: active ? meta.bg : "var(--color-ground)", color: active ? meta.color : "var(--color-ink-2)", border: `1.5px solid ${active ? meta.bg : "var(--color-rule)"}`, cursor: "pointer" }}>{meta.label}</button>; })}
        </div></div>
        {error && <p role="alert" className="text-xs" style={{ color: "#991B1B" }}>{error}</p>}
      </div>
      <div className="px-6 pb-5"><button onClick={() => void submit()} disabled={!valid || saving} className="w-full py-2.5 rounded-xl text-sm font-medium" style={{ backgroundColor: valid && !saving ? "var(--color-ink)" : "var(--color-ground)", color: valid && !saving ? "#fff" : "var(--color-ink-3)", border: "none", cursor: valid && !saving ? "pointer" : "not-allowed" }}>{saving ? "กำลังเพิ่ม…" : "เพิ่มสมาชิก"}</button></div>
    </div>
  </div>;
}

export default function Settings() {
  const { user, role, isSuperAdmin, canManageMembers, canEditCampaigns } = useAuth();
  const { customers, rawCustomers, rawTransactions, posConnected, connectPos, resetPos } = useData();

  const [posKey, setPosKey] = useState(() => localStorage.getItem("cdp.posKey") ?? "");
  const [posEndpoint, setPosEndpoint] = useState(() => localStorage.getItem("cdp.posEndpoint") ?? "");
  const [posError, setPosError] = useState<string | null>(null);

  const [lineStatus, setLineStatus] = useState<{ connected: boolean; channelId: string | null; basicId: string | null; addFriendUrl: string | null } | null>(null);
  const [lineStatusError, setLineStatusError] = useState<string | null>(null);
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [testUserId, setTestUserId] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [lineUsers, setLineUsers] = useState<LineUserRow[]>([]);
  const [loadingLineUsers, setLoadingLineUsers] = useState(false);
  const [lineUsersError, setLineUsersError] = useState<string | null>(null);
  const [syncingFollowers, setSyncingFollowers] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [copiedLineUserId, setCopiedLineUserId] = useState<string | null>(null);
  const [lineUserSearch, setLineUserSearch] = useState("");

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

  async function transferSuperAdmin(entry: TeamEntry) {
    if (!window.confirm(`โอนสิทธิ์ Super Admin ให้ ${entry.name}? คุณจะเหลือสิทธิ์ Admin แทน`)) return;
    setTeamError(null);
    const { error } = await supabase.rpc("transfer_super_admin", { p_target_user_id: entry.id });
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

  useEffect(() => {
    let active = true;
    fetch("/api/line-status")
      .then((res) => res.json())
      .then((data) => { if (active) setLineStatus(data); })
      .catch(() => { if (active) setLineStatusError("โหลดสถานะ LINE ไม่สำเร็จ"); });
    return () => { active = false; };
  }, []);

  const webhookUrl = `${window.location.origin}/api/line-webhook`;

  async function copyWebhookUrl() {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setWebhookCopied(true);
      setTimeout(() => setWebhookCopied(false), 2000);
    } catch {
      setLineStatusError("คัดลอกไม่สำเร็จ กรุณาคัดลอกด้วยตนเอง");
    }
  }

  async function authHeader(): Promise<Record<string, string>> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function handleTestSend() {
    if (!testUserId.trim() || !testMessage.trim() || sendingTest) return;
    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/line-send", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ to: testUserId.trim(), text: testMessage.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "ส่งข้อความไม่สำเร็จ");
      setTestResult({ ok: true, message: "ส่งข้อความสำเร็จ" });
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : "ส่งข้อความไม่สำเร็จ" });
    } finally {
      setSendingTest(false);
    }
  }

  const loadLineUsers = useCallback(async () => {
    setLoadingLineUsers(true);
    setLineUsersError(null);
    const { data, error } = await supabase
      .from("line_users")
      .select("line_user_id,display_name,picture_url,last_message_text,last_message_at,followed,is_admin,segment")
      .order("last_message_at", { ascending: false, nullsFirst: false });
    if (error) { setLineUsersError(error.message); setLoadingLineUsers(false); return; }
    setLineUsers(data ?? []);
    setLoadingLineUsers(false);
  }, []);

  useEffect(() => { void loadLineUsers(); }, [loadLineUsers]);

  const filteredLineUsers = useMemo(() => {
    const q = lineUserSearch.trim().toLowerCase();
    if (!q) return lineUsers;
    return lineUsers.filter((u) =>
      (u.display_name ?? "").toLowerCase().includes(q) ||
      u.line_user_id.toLowerCase().includes(q) ||
      (u.segment ?? "").toLowerCase().includes(q) ||
      (u.last_message_text ?? "").toLowerCase().includes(q)
    );
  }, [lineUsers, lineUserSearch]);

  async function handleSyncFollowers() {
    setSyncingFollowers(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/line-sync-followers", { method: "POST", headers: await authHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "ซิงค์ผู้ติดตามไม่สำเร็จ");
      setSyncResult({ ok: true, message: `ซิงค์แล้ว ${data.synced} คน` });
      await loadLineUsers();
    } catch (err) {
      setSyncResult({ ok: false, message: err instanceof Error ? err.message : "ซิงค์ผู้ติดตามไม่สำเร็จ" });
    } finally {
      setSyncingFollowers(false);
    }
  }

  async function copyLineUserId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedLineUserId(id);
      setTimeout(() => setCopiedLineUserId((current) => (current === id ? null : current)), 2000);
    } catch {
      setLineUsersError("คัดลอกไม่สำเร็จ กรุณาคัดลอกด้วยตนเอง");
    }
  }

  async function toggleLineAdmin(lineUser: LineUserRow) {
    setLineUsersError(null);
    const { error } = await supabase.from("line_users").update({ is_admin: !lineUser.is_admin }).eq("line_user_id", lineUser.line_user_id);
    if (error) { setLineUsersError(error.message); return; }
    await loadLineUsers();
  }

  async function setLineSegment(lineUser: LineUserRow, segment: LineSegment | "") {
    setLineUsersError(null);
    const { error } = await supabase.from("line_users").update({ segment: segment || null }).eq("line_user_id", lineUser.line_user_id);
    if (error) { setLineUsersError(error.message); return; }
    await loadLineUsers();
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
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>LINE Official Account</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>เชื่อมต่อผ่าน LINE Messaging API จริง — Channel Secret และ Access Token ตั้งค่าไว้บนเซิร์ฟเวอร์เท่านั้น</p>
            </div>
            {lineStatus && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0" style={{ backgroundColor: lineStatus.connected ? "#DCFCE7" : "#FEF3C7", color: lineStatus.connected ? "#166534" : "#92400E" }}>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: lineStatus.connected ? "#166534" : "#92400E" }} />
                {lineStatus.connected ? "เชื่อมต่อแล้ว" : "ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์"}
              </span>
            )}
          </div>
        </div>
        <div className="px-6 py-5 space-y-4">
          {lineStatusError && <p role="alert" className="text-xs" style={{ color: "#991B1B" }}>{lineStatusError}</p>}

          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--color-ink-2)", display: "block" }}>Webhook URL</label>
            <div className="flex items-center gap-2">
              <input readOnly value={webhookUrl} onFocus={(event) => event.target.select()} className="flex-1 px-3.5 py-2.5 rounded-xl text-xs outline-none" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)", color: "var(--color-ink)", fontFamily: "monospace" }} />
              <button onClick={() => void copyWebhookUrl()} className="px-3.5 py-2.5 rounded-xl text-xs font-medium flex-shrink-0" style={{ backgroundColor: webhookCopied ? "#DCFCE7" : "var(--color-ink)", color: webhookCopied ? "#166534" : "#fff", border: "none", cursor: "pointer" }}>
                {webhookCopied ? "คัดลอกแล้ว" : "คัดลอก"}
              </button>
            </div>
            <p className="text-xs" style={{ color: "var(--color-ink-3)" }}>นำ URL นี้ไปตั้งค่าใน LINE Developers Console → Messaging API → Webhook URL แล้วเปิดใช้งาน "Use webhook"</p>
          </div>

          {lineStatus?.basicId && (
            <div className="rounded-xl px-4 py-3" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)" }}>
              <p className="text-xs" style={{ color: "var(--color-ink-3)" }}>LINE OA Basic ID</p>
              <p className="text-sm font-mono mt-0.5" style={{ color: "var(--color-ink)" }}>{lineStatus.basicId}</p>
              {lineStatus.addFriendUrl && <a href={lineStatus.addFriendUrl} target="_blank" rel="noreferrer" className="text-xs mt-1 inline-block" style={{ color: "#06C755" }}>ลิงก์เพิ่มเพื่อน →</a>}
            </div>
          )}

          <div className="pt-4" style={{ borderTop: "1px solid var(--color-rule)" }}>
            <p className="text-xs font-medium mb-3" style={{ color: "var(--color-ink-2)" }}>ทดสอบส่งข้อความ</p>
            <div className="space-y-3">
              <Field label="LINE User ID" value={testUserId} onChange={setTestUserId} placeholder="U4af4980629…" mono />
              <Field label="ข้อความ" value={testMessage} onChange={setTestMessage} placeholder="สวัสดีค่ะ…" />
              <button
                onClick={() => void handleTestSend()}
                disabled={!testUserId.trim() || !testMessage.trim() || sendingTest || !lineStatus?.connected}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{
                  backgroundColor: lineStatus?.connected && testUserId.trim() && testMessage.trim() ? "var(--color-ink)" : "var(--color-ground)",
                  color: lineStatus?.connected && testUserId.trim() && testMessage.trim() ? "#fff" : "var(--color-ink-3)",
                  border: "none",
                  cursor: lineStatus?.connected && !sendingTest ? "pointer" : "not-allowed",
                }}
              >
                {sendingTest ? "กำลังส่ง…" : "ส่งข้อความทดสอบ"}
              </button>
              {testResult && <p role="alert" className="text-xs" style={{ color: testResult.ok ? "#166534" : "#991B1B" }}>{testResult.message}</p>}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid var(--color-rule)" }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>สมาชิก LINE OA</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>{lineUsers.length} คน — บันทึกอัตโนมัติเมื่อมีคนทักข้อความหรือกดเพิ่มเพื่อน</p>
          </div>
          <button onClick={() => void handleSyncFollowers()} disabled={syncingFollowers || !lineStatus?.connected} className="px-4 py-2 rounded-xl text-sm font-medium flex-shrink-0" style={{ backgroundColor: lineStatus?.connected ? "var(--color-ink)" : "var(--color-ground)", color: lineStatus?.connected ? "#fff" : "var(--color-ink-3)", border: "none", cursor: lineStatus?.connected && !syncingFollowers ? "pointer" : "not-allowed" }}>
            {syncingFollowers ? "กำลังซิงค์…" : "ซิงค์ผู้ติดตามทั้งหมด"}
          </button>
        </div>
        {syncResult && <p role="alert" className="mx-5 mt-4 text-xs" style={{ color: syncResult.ok ? "#166534" : "#991B1B" }}>{syncResult.message}</p>}
        {lineUsersError && <p role="alert" className="mx-5 mt-4 text-xs" style={{ color: "#991B1B" }}>{lineUsersError}</p>}
        {loadingLineUsers ? (
          <p className="px-6 py-8 text-sm" style={{ color: "var(--color-ink-3)" }}>กำลังโหลดสมาชิก…</p>
        ) : lineUsers.length === 0 ? (
          <p className="px-6 py-8 text-sm" style={{ color: "var(--color-ink-3)" }}>ยังไม่มีข้อมูล — ลองพิมพ์อะไรก็ได้ไปที่ LINE OA หรือกด "ซิงค์ผู้ติดตามทั้งหมด"</p>
        ) : (
          <>
            <div className="px-5 pt-4">
              <input
                value={lineUserSearch}
                onChange={(event) => setLineUserSearch(event.target.value)}
                placeholder="ค้นหาด้วยชื่อ, LINE User ID, Segment หรือข้อความล่าสุด"
                className="w-full px-3.5 py-2 rounded-xl text-sm outline-none"
                style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)", color: "var(--color-ink)" }}
              />
            </div>
            {filteredLineUsers.length === 0 ? (
              <p className="px-6 py-8 text-sm" style={{ color: "var(--color-ink-3)" }}>ไม่พบสมาชิกที่ตรงกับคำค้นหา</p>
            ) : (
              <div className="mt-3 overflow-y-auto" style={{ maxHeight: 340 }}>
                <table className="w-full text-sm">
                  <thead><tr style={{ borderBottom: "1px solid var(--color-rule)" }}>
                    {["ผู้ใช้", "ข้อความล่าสุด", "Segment", "แอดมินบอท"].map((heading, index) => <th key={`${heading}-${index}`} className="px-5 py-3 text-xs font-medium text-left" style={{ color: "var(--color-ink-3)" }}>{heading}</th>)}
                  </tr></thead>
                  <tbody>
                    {filteredLineUsers.map((lineUser, index) => (
                      <tr key={lineUser.line_user_id} style={{ borderBottom: index < filteredLineUsers.length - 1 ? "1px solid var(--color-rule)" : "none" }}>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            {lineUser.picture_url ? (
                              <img src={lineUser.picture_url} alt="" className="w-7 h-7 rounded-full flex-shrink-0" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0" style={{ backgroundColor: "var(--color-ground)", color: "var(--color-ink-3)" }}>{lineUser.display_name?.[0] ?? "?"}</div>
                            )}
                            <div className="min-w-0">
                              <p className="font-medium truncate">{lineUser.display_name ?? "ไม่ทราบชื่อ"}</p>
                              <button onClick={() => void copyLineUserId(lineUser.line_user_id)} className="text-xs font-mono truncate block" style={{ color: copiedLineUserId === lineUser.line_user_id ? "#166534" : "var(--color-ink-3)", background: "none", border: "none", padding: 0, cursor: "pointer", maxWidth: 180 }} title="คัดลอก LINE User ID">
                                {copiedLineUserId === lineUser.line_user_id ? "คัดลอกแล้ว" : lineUser.line_user_id}
                              </button>
                              {!lineUser.followed && <p className="text-xs" style={{ color: "#92400E" }}>เลิกติดตามแล้ว</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-xs max-w-[160px] truncate" style={{ color: "var(--color-ink-2)" }}>{lineUser.last_message_text ?? "—"}</td>
                        <td className="px-5 py-3.5">
                          {canEditCampaigns ? (
                            <select
                              aria-label={`Segment ของ ${lineUser.line_user_id}`}
                              value={lineUser.segment ?? ""}
                              onChange={(event) => void setLineSegment(lineUser, event.target.value as LineSegment | "")}
                              className="rounded-full pl-3 pr-6 py-1.5 text-xs font-medium outline-none"
                              style={{ backgroundColor: lineUser.segment ? "#E0E7FF" : "var(--color-ground)", color: lineUser.segment ? "#3730A3" : "var(--color-ink-3)", border: "1px solid var(--color-rule)", cursor: "pointer" }}
                            >
                              <option value="">ไม่ระบุ</option>
                              {LINE_SEGMENTS.map((seg) => <option key={seg} value={seg}>{seg}</option>)}
                            </select>
                          ) : (
                            <span className="text-xs" style={{ color: "var(--color-ink-3)" }}>{lineUser.segment ?? "ไม่ระบุ"}</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          {canEditCampaigns ? (
                            <button onClick={() => void toggleLineAdmin(lineUser)} className="text-xs font-medium rounded-full px-3 py-1.5" style={{ backgroundColor: lineUser.is_admin ? "#1A1917" : "var(--color-ground)", color: lineUser.is_admin ? "#fff" : "var(--color-ink-2)", border: "1px solid var(--color-rule)", cursor: "pointer" }}>
                              {lineUser.is_admin ? "แอดมิน ✓" : "ตั้งเป็นแอดมิน"}
                            </button>
                          ) : (
                            lineUser.is_admin && <span className="text-xs font-medium" style={{ color: "var(--color-ink)" }}>แอดมิน</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </SectionCard>

      {canManageMembers ? <SectionCard>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid var(--color-rule)" }}><div><p className="text-sm font-semibold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>จัดการทีม</p><p className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>{team.length} รายการ</p></div><button onClick={() => setInviteOpen(true)} className="px-4 py-2 rounded-xl text-sm font-medium" style={{ backgroundColor: "var(--color-ink)", color: "#fff", border: "none", cursor: "pointer" }}>เชิญสมาชิก</button></div>
        {teamError && <p role="alert" className="mx-5 mt-4 text-xs" style={{ color: "#991B1B" }}>{teamError}</p>}
        {loadingTeam ? <p className="px-6 py-8 text-sm" style={{ color: "var(--color-ink-3)" }}>กำลังโหลดสมาชิก…</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr style={{ borderBottom: "1px solid var(--color-rule)" }}>
          {["สมาชิก", "สถานะ", "Role", ""].map((heading, index) => <th key={`${heading}-${index}`} className={`px-5 py-3 text-xs font-medium ${index === 3 ? "text-right" : "text-left"}`} style={{ color: "var(--color-ink-3)" }}>{heading}</th>)}
        </tr></thead><tbody>
          {team.map((member, index) => {
            const isAdminTier = member.role === "admin" || member.role === "super_admin";
            const dropdownDisabled = member.isYou || (isAdminTier && !isSuperAdmin);
            const assignableForCaller = isSuperAdmin ? ASSIGNABLE_ROLES : (["editor", "viewer"] as WorkspaceRole[]);
            // The <select>'s current value must always have a matching <option>,
            // even when that role isn't one this viewer could reassign TO —
            // otherwise the browser silently falls back to the first listed
            // option (e.g. an admin row shows as "Editor" to a non-super-admin
            // viewer, even though the background color still reflects the
            // real role correctly).
            const dropdownOptions = Array.from(new Set<WorkspaceRole>([member.role, ...assignableForCaller]));
            const canRemove = !member.isYou && member.role !== "super_admin" && (member.role !== "admin" || isSuperAdmin);
            const canTransfer = isSuperAdmin && member.status === "active" && !member.isYou && member.role !== "super_admin";
            return <tr key={`${member.status}-${member.id}`} style={{ borderBottom: index < team.length - 1 ? "1px solid var(--color-rule)" : "none" }}>
              <td className="px-5 py-3.5"><p className="font-medium">{member.name}{member.isYou && <span className="ml-2 text-xs" style={{ color: "var(--color-ink-3)" }}>(คุณ)</span>}</p><p className="text-xs" style={{ color: "var(--color-ink-3)" }}>{member.email}</p></td>
              <td className="px-5 py-3.5"><span className="text-xs" style={{ color: member.status === "active" ? "#166534" : "#92400E" }}>{member.status === "active" ? "ใช้งานแล้ว" : "รอล็อกอินครั้งแรก"}</span></td>
              <td className="px-5 py-3.5">
                <div className="relative inline-block">
                  <select
                    aria-label={`Role ของ ${member.email}`}
                    value={member.role}
                    onChange={(event) => void changeRole(member, event.target.value as WorkspaceRole)}
                    disabled={dropdownDisabled}
                    className="appearance-none rounded-full pl-3.5 pr-8 py-1.5 text-xs font-medium outline-none"
                    style={{ backgroundColor: ROLE_META[member.role].bg, color: ROLE_META[member.role].color, border: "none", cursor: dropdownDisabled ? "not-allowed" : "pointer" }}
                  >
                    {dropdownOptions.map((item) => <option key={item} value={item}>{ROLE_META[item].label}</option>)}
                  </select>
                  <svg className="pointer-events-none absolute" style={{ right: "10px", top: "50%", transform: "translateY(-50%)" }} width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 3.5L5 6.5L8 3.5" stroke={ROLE_META[member.role].color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </td>
              <td className="px-5 py-3.5 text-right">
                <div className="flex items-center justify-end gap-2">
                  {canTransfer && <button onClick={() => void transferSuperAdmin(member)} aria-label={`โอนสิทธิ์ Super Admin ให้ ${member.name}`} className="text-xs font-medium rounded-full px-3 py-1.5" style={{ color: "#7C2D12", backgroundColor: "transparent", border: "1px solid var(--color-rule)", cursor: "pointer" }}>โอน Super Admin</button>}
                  {canRemove && <button onClick={() => void removeMember(member)} aria-label={`ลบ ${member.name}`} className="text-xs font-medium rounded-full px-3 py-1.5" style={{ color: "#991B1B", backgroundColor: "transparent", border: "1px solid var(--color-rule)", cursor: "pointer" }}>ลบ</button>}
                </div>
              </td>
            </tr>;
          })}
        </tbody></table></div>}
      </SectionCard> : <SectionCard><div className="px-6 py-5"><p className="text-sm font-semibold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>สิทธิ์สมาชิก</p><p className="text-sm mt-2" style={{ color: "var(--color-ink-2)" }}>เฉพาะ Admin เท่านั้นที่เพิ่มสมาชิกและกำหนด Role ได้</p></div></SectionCard>}

      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} onInvited={loadTeam} />}
    </main>
  );
}
