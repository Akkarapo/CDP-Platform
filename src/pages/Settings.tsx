import { useCallback, useEffect, useState } from "react";
import { useAuth, type WorkspaceRole } from "../lib/auth";
import { supabase } from "../lib/supabase";

type TeamEntry = { id: string; name: string; email: string; role: WorkspaceRole; status: "active" | "pending"; isYou?: boolean };

const ROLE_META: Record<WorkspaceRole, { label: string; bg: string; color: string }> = {
  admin: { label: "Admin", bg: "#1A1917", color: "#ffffff" },
  editor: { label: "Editor", bg: "#E0E7FF", color: "#3730A3" },
  viewer: { label: "Viewer", bg: "#F3F4F6", color: "#6B7280" },
};

function SectionCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)" }}>{children}</div>;
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div className="space-y-1.5"><label className="text-xs font-medium" style={{ color: "var(--color-ink-2)", display: "block" }}>{label}</label><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)", color: "var(--color-ink)" }} /></div>;
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

  return <main className="max-w-3xl mx-auto px-6 py-8 space-y-5">
    <div><h1 className="text-xl font-semibold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>Settings</h1><p className="text-sm mt-0.5" style={{ color: "var(--color-ink-3)" }}>จัดการบัญชีและสิทธิ์สมาชิก</p></div>
    <SectionCard><div className="px-6 py-5" style={{ borderBottom: "1px solid var(--color-rule)" }}><p className="text-sm font-semibold">บัญชี Google</p><p className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>บัญชีที่ใช้เข้าสู่ระบบอยู่ในขณะนี้</p></div><div className="px-6 py-5 flex items-center gap-4">
      {user?.picture ? <img src={user.picture} alt="" className="w-11 h-11 rounded-full" referrerPolicy="no-referrer" /> : <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold" style={{ backgroundColor: "var(--color-ink)", color: "#fff" }}>{user?.name?.[0] ?? "?"}</div>}
      <div><p className="text-sm font-medium">{user?.name}</p><p className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>{user?.email}</p>{role && <span className="inline-flex mt-2 px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: ROLE_META[role].bg, color: ROLE_META[role].color }}>{ROLE_META[role].label}</span>}</div>
    </div></SectionCard>
    {canManageMembers ? <SectionCard>
      <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid var(--color-rule)" }}><div><p className="text-sm font-semibold">จัดการทีม</p><p className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>{team.length} รายการ</p></div><button onClick={() => setInviteOpen(true)} className="px-4 py-2 rounded-xl text-sm font-medium" style={{ backgroundColor: "var(--color-ink)", color: "#fff", border: "none", cursor: "pointer" }}>เชิญสมาชิก</button></div>
      {teamError && <p role="alert" className="mx-5 mt-4 text-xs" style={{ color: "#991B1B" }}>{teamError}</p>}
      {loadingTeam ? <p className="px-6 py-8 text-sm" style={{ color: "var(--color-ink-3)" }}>กำลังโหลดสมาชิก…</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr style={{ borderBottom: "1px solid var(--color-rule)" }}>{["สมาชิก", "สถานะ", "Role"].map((heading, index) => <th key={heading} className={`px-5 py-3 text-xs font-medium ${index === 2 ? "text-right" : "text-left"}`} style={{ color: "var(--color-ink-3)" }}>{heading}</th>)}</tr></thead><tbody>
        {team.map((member, index) => <tr key={`${member.status}-${member.id}`} style={{ borderBottom: index < team.length - 1 ? "1px solid var(--color-rule)" : "none" }}><td className="px-5 py-3.5"><p className="font-medium">{member.name}{member.isYou && <span className="ml-2 text-xs" style={{ color: "var(--color-ink-3)" }}>(คุณ)</span>}</p><p className="text-xs" style={{ color: "var(--color-ink-3)" }}>{member.email}</p></td><td className="px-5 py-3.5"><span className="text-xs" style={{ color: member.status === "active" ? "#166534" : "#92400E" }}>{member.status === "active" ? "ใช้งานแล้ว" : "รอล็อกอินครั้งแรก"}</span></td><td className="px-5 py-3.5 text-right"><select aria-label={`Role ของ ${member.email}`} value={member.role} onChange={(event) => void changeRole(member, event.target.value as WorkspaceRole)} disabled={member.isYou} className="rounded-lg px-2.5 py-1.5 text-xs" style={{ backgroundColor: ROLE_META[member.role].bg, color: ROLE_META[member.role].color, border: "none", cursor: member.isYou ? "not-allowed" : "pointer" }}>{(Object.keys(ROLE_META) as WorkspaceRole[]).map((item) => <option key={item} value={item}>{ROLE_META[item].label}</option>)}</select></td></tr>)}
      </tbody></table></div>}
    </SectionCard> : <SectionCard><div className="px-6 py-5"><p className="text-sm font-semibold">สิทธิ์สมาชิก</p><p className="text-sm mt-2" style={{ color: "var(--color-ink-2)" }}>เฉพาะ Admin เท่านั้นที่เพิ่มสมาชิกและกำหนด Role ได้</p></div></SectionCard>}
    {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} onInvited={loadTeam} />}
  </main>;
}
