import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { multicastMessage, type LineMessage } from "./lineClient.js";

const MULTICAST_CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export async function sendCampaignToLine(campaignId: string, accessToken: string): Promise<number> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase admin client ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์");

  const { data: campaign, error: campaignError } = await admin
    .from("campaigns")
    .select("id,status,paused,message,target_segment,image_url")
    .eq("id", campaignId)
    .single();
  if (campaignError || !campaign) throw new Error("ไม่พบแคมเปญนี้");
  if (campaign.status === "sent") throw new Error("แคมเปญนี้ถูกส่งไปแล้ว");
  if (campaign.status !== "approved") throw new Error("ส่งได้เฉพาะแคมเปญที่อนุมัติแล้วเท่านั้น");
  if (campaign.paused) throw new Error("แคมเปญนี้หยุดชั่วคราวอยู่ กดดำเนินการต่อก่อนถึงจะส่งได้");

  let query = admin.from("line_users").select("line_user_id").eq("followed", true);
  if (campaign.target_segment !== "ทุก Segment") {
    query = query.eq("segment", campaign.target_segment);
  }
  const { data: recipients, error: recipientsError } = await query;
  if (recipientsError) throw new Error(recipientsError.message);

  const recipientIds = (recipients ?? []).map((r) => r.line_user_id);

  if (recipientIds.length > 0) {
    const messages: LineMessage[] = [];
    if (campaign.image_url) {
      messages.push({ type: "image", originalContentUrl: campaign.image_url, previewImageUrl: campaign.image_url });
    }
    messages.push({ type: "text", text: campaign.message });

    for (const group of chunk(recipientIds, MULTICAST_CHUNK_SIZE)) {
      await multicastMessage(group, messages, accessToken);
    }
  }

  const { error: updateError } = await admin
    .from("campaigns")
    .update({ status: "sent", updated_at: new Date().toISOString() })
    .eq("id", campaignId);
  if (updateError) throw new Error(updateError.message);

  return recipientIds.length;
}
