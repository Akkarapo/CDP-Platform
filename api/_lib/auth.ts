import type { VercelRequest } from "@vercel/node";
import { getSupabaseAdmin } from "./supabaseAdmin.js";

export type AuthResult = { ok: true; userId: string } | { ok: false; status: number; error: string };

// Verifies the caller's Supabase session and workspace role for
// privileged endpoints that use the service-role client (bypasses RLS),
// so authorization has to be enforced here instead.
export async function requireWorkspaceRole(req: VercelRequest, allowedRoles: string[]): Promise<AuthResult> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return { ok: false, status: 401, error: "ไม่ได้เข้าสู่ระบบ" };

  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, status: 500, error: "Supabase admin client ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์" };

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return { ok: false, status: 401, error: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" };

  const { data: member } = await admin
    .from("workspace_members")
    .select("role")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!member || !allowedRoles.includes(member.role)) {
    return { ok: false, status: 403, error: "ไม่มีสิทธิ์ดำเนินการนี้" };
  }

  return { ok: true, userId: userData.user.id };
}
