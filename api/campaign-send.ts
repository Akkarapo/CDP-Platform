import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireWorkspaceRole } from "./_lib/auth.js";
import { sendCampaignToLine } from "./_lib/campaignSend.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = await requireWorkspaceRole(req, ["admin", "editor"]);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) {
    res.status(500).json({ error: "LINE_CHANNEL_ACCESS_TOKEN ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์" });
    return;
  }

  const { campaignId } = req.body as { campaignId?: string };
  if (!campaignId) {
    res.status(400).json({ error: "กรุณาระบุ campaignId" });
    return;
  }

  try {
    const recipientCount = await sendCampaignToLine(campaignId, accessToken);
    res.status(200).json({ ok: true, recipientCount });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "ส่งแคมเปญไม่สำเร็จ" });
  }
}
