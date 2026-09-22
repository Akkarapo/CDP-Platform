import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { getProfile, getFollowerIds, type LineWebhookEvent } from "./lineClient.js";

export async function recordLineEvent(event: LineWebhookEvent, accessToken: string) {
  const userId = event.source?.userId;
  if (!userId) return;
  const admin = getSupabaseAdmin();
  if (!admin) return;

  if (event.type === "unfollow") {
    await admin.from("line_users").update({ followed: false, unfollowed_at: new Date().toISOString() }).eq("line_user_id", userId);
    return;
  }

  const profile = await getProfile(userId, accessToken);
  const row: Record<string, unknown> = {
    line_user_id: userId,
    followed: true,
    updated_at: new Date().toISOString(),
  };
  if (profile) {
    row.display_name = profile.displayName;
    row.picture_url = profile.pictureUrl ?? null;
    row.status_message = profile.statusMessage ?? null;
  }
  if (event.type === "message" && event.message?.type === "text") {
    row.last_message_text = event.message.text;
    row.last_message_at = new Date().toISOString();
  }
  await admin.from("line_users").upsert(row, { onConflict: "line_user_id" });
}

export async function isLineAdmin(userId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const { data } = await admin.from("line_users").select("is_admin").eq("line_user_id", userId).maybeSingle();
  return Boolean(data?.is_admin);
}

export async function syncFollowers(accessToken: string): Promise<number> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase admin client ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์");

  const followerIds = await getFollowerIds(accessToken, 200);
  let synced = 0;
  for (const userId of followerIds) {
    const profile = await getProfile(userId, accessToken);
    const row: Record<string, unknown> = {
      line_user_id: userId,
      followed: true,
      updated_at: new Date().toISOString(),
    };
    if (profile) {
      row.display_name = profile.displayName;
      row.picture_url = profile.pictureUrl ?? null;
      row.status_message = profile.statusMessage ?? null;
    }
    const { error } = await admin.from("line_users").upsert(row, { onConflict: "line_user_id" });
    if (!error) synced += 1;
  }
  return synced;
}
