import { randomInt } from "node:crypto";
import { getSupabaseAdmin } from "./supabaseAdmin.js";

// Excludes visually ambiguous characters (0/O, 1/I) since a human retypes
// this code by hand into a LINE chat.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateTrackingCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_CHARS[randomInt(CODE_CHARS.length)];
  return code;
}

export async function recordClick(campaignId: string | null): Promise<string | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateTrackingCode();
    const { error } = await admin.from("campaign_clicks").insert({ campaign_id: campaignId, code });
    if (!error) return code;
  }
  return null;
}

export async function confirmClick(code: string, lineUserId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin || !lineUserId) return false;
  const { data } = await admin
    .from("campaign_clicks")
    .update({ confirmed_line_user_id: lineUserId, confirmed_at: new Date().toISOString() })
    .eq("code", code)
    .is("confirmed_line_user_id", null)
    .select("id")
    .maybeSingle();
  return Boolean(data);
}

export interface ReportStats {
  totalClicks: number;
  confirmedClicks: number;
  confirmationRate: number;
}

export async function getReportStats(): Promise<ReportStats> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase admin client ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์");
  const [{ count: totalClicks }, { count: confirmedClicks }] = await Promise.all([
    admin.from("campaign_clicks").select("id", { count: "exact", head: true }),
    admin.from("campaign_clicks").select("id", { count: "exact", head: true }).not("confirmed_line_user_id", "is", null),
  ]);
  const total = totalClicks ?? 0;
  const confirmed = confirmedClicks ?? 0;
  return { totalClicks: total, confirmedClicks: confirmed, confirmationRate: total > 0 ? confirmed / total : 0 };
}
