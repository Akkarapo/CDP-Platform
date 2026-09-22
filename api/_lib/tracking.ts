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

export interface CampaignGate {
  allowed: boolean;
  reason?: "cancelled" | "paused";
  name: string | null;
}

// Shared by the click-landing page and the code-confirmation flow — a
// campaign that's paused or cancelled should reject both, not just one.
export async function checkCampaignGate(campaignId: string | null): Promise<CampaignGate> {
  if (!campaignId) return { allowed: true, name: null };
  const admin = getSupabaseAdmin();
  if (!admin) return { allowed: true, name: null };
  const { data: campaign } = await admin.from("campaigns").select("name,status,paused").eq("id", campaignId).maybeSingle();
  if (!campaign) return { allowed: true, name: null };
  if (campaign.status === "cancelled" || campaign.status === "rejected") {
    return { allowed: false, reason: "cancelled", name: campaign.name };
  }
  if (campaign.paused) {
    return { allowed: false, reason: "paused", name: campaign.name };
  }
  return { allowed: true, name: campaign.name };
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

export interface ConfirmResult {
  ok: boolean;
  reason?: "not_found" | "paused" | "cancelled";
  campaignId: string | null;
  campaignName: string | null;
  confirmedCount: number;
}

export async function confirmClick(code: string, lineUserId: string): Promise<ConfirmResult> {
  const notFound: ConfirmResult = { ok: false, reason: "not_found", campaignId: null, campaignName: null, confirmedCount: 0 };
  const admin = getSupabaseAdmin();
  if (!admin || !lineUserId) return notFound;

  const { data: click } = await admin
    .from("campaign_clicks")
    .select("id,campaign_id")
    .eq("code", code)
    .is("confirmed_line_user_id", null)
    .maybeSingle();
  if (!click) return notFound;

  const gate = await checkCampaignGate(click.campaign_id);
  if (!gate.allowed) {
    return { ok: false, reason: gate.reason, campaignId: click.campaign_id, campaignName: gate.name, confirmedCount: 0 };
  }

  await admin
    .from("campaign_clicks")
    .update({ confirmed_line_user_id: lineUserId, confirmed_at: new Date().toISOString() })
    .eq("id", click.id);

  let countQuery = admin.from("campaign_clicks").select("id", { count: "exact", head: true }).not("confirmed_line_user_id", "is", null);
  countQuery = click.campaign_id ? countQuery.eq("campaign_id", click.campaign_id) : countQuery.is("campaign_id", null);
  const { count } = await countQuery;

  return { ok: true, campaignId: click.campaign_id, campaignName: gate.name, confirmedCount: count ?? 1 };
}

export interface CampaignReportRow {
  name: string;
  status: string;
  paused: boolean;
  totalClicks: number;
  confirmedClicks: number;
}

export async function getCampaignReport(limit = 5): Promise<CampaignReportRow[]> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase admin client ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์");

  const { data: campaigns } = await admin
    .from("campaigns")
    .select("id,name,status,paused")
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows: CampaignReportRow[] = [];
  for (const c of campaigns ?? []) {
    const [{ count: totalClicks }, { count: confirmedClicks }] = await Promise.all([
      admin.from("campaign_clicks").select("id", { count: "exact", head: true }).eq("campaign_id", c.id),
      admin.from("campaign_clicks").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).not("confirmed_line_user_id", "is", null),
    ]);
    rows.push({ name: c.name, status: c.status, paused: c.paused, totalClicks: totalClicks ?? 0, confirmedClicks: confirmedClicks ?? 0 });
  }
  return rows;
}

const STATUS_LABELS_TH: Record<string, string> = {
  pending: "รออนุมัติ",
  rejected: "ไม่อนุมัติ",
  approved: "อนุมัติแล้ว",
  cancelled: "ยกเลิกแล้ว",
  sent: "ส่งแล้ว",
};

export function formatCampaignReport(rows: CampaignReportRow[]): string {
  if (rows.length === 0) return "ยังไม่มีแคมเปญ";
  const lines = rows.map((r) => {
    const statusLabel = r.paused ? "หยุดชั่วคราว" : (STATUS_LABELS_TH[r.status] ?? r.status);
    const ctr = r.totalClicks > 0 ? ((r.confirmedClicks / r.totalClicks) * 100).toFixed(1) : "0.0";
    return `"${r.name}" (${statusLabel})\nคลิก ${r.totalClicks} · ยืนยัน ${r.confirmedClicks} · CTR ${ctr}%`;
  });
  return `รายงานผลแคมเปญ (${rows.length} ล่าสุด)\n\n${lines.join("\n\n")}`;
}
