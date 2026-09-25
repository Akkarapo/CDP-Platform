import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyLineSignature, replyMessage, type LineWebhookBody } from "./_lib/lineClient.js";
import { recordLineEvent, isLineAdmin } from "./_lib/lineUsers.js";
import { confirmClick, getCampaignReport, formatCampaignReport } from "./_lib/tracking.js";

const TRACKING_CODE_PATTERN = /^[A-Z0-9]{6}$/;

export const config = { api: { bodyParser: false } };

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelSecret || !accessToken) {
    res.status(500).json({ error: "LINE channel ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์" });
    return;
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers["x-line-signature"];
  if (!verifyLineSignature(rawBody, typeof signature === "string" ? signature : undefined, channelSecret)) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  const body = rawBody.length ? (JSON.parse(rawBody.toString("utf-8")) as LineWebhookBody) : { destination: "", events: [] };

  await Promise.all(
    body.events.map(async (event) => {
      try {
        await recordLineEvent(event, accessToken);
        if (event.type === "message" && event.message?.type === "text" && event.replyToken) {
          const text = (event.message.text ?? "").trim();
          const userId = event.source?.userId;

          if (TRACKING_CODE_PATTERN.test(text.toUpperCase())) {
            const result = userId
              ? await confirmClick(text.toUpperCase(), userId)
              : { ok: false as const, reason: "not_found" as const, campaignId: null, campaignName: null, confirmedCount: 0 };
            let replyText: string;
            if (result.ok) {
              replyText = "ยืนยันการใช้โค้ดสำเร็จ ขอบคุณค่ะ 🎉";
            } else if (result.reason === "paused") {
              replyText = `แคมเปญ "${result.campaignName}" หยุดรับการยืนยันชั่วคราวอยู่ กรุณาลองใหม่ภายหลัง`;
            } else if (result.reason === "cancelled") {
              replyText = `แคมเปญ "${result.campaignName}" ถูกยกเลิกแล้ว ไม่สามารถใช้โค้ดนี้ได้อีก`;
            } else {
              replyText = "ไม่พบรหัสนี้ หรือถูกใช้ไปแล้ว";
            }
            await replyMessage(event.replyToken, [{ type: "text", text: replyText }], accessToken);
          } else if (text === "/report") {
            const allowed = userId ? await isLineAdmin(userId) : false;
            if (!allowed) {
              await replyMessage(event.replyToken, [{ type: "text", text: "คำสั่งนี้สำหรับแอดมินเท่านั้น" }], accessToken);
            } else {
              const rows = await getCampaignReport(5);
              await replyMessage(event.replyToken, [{ type: "text", text: formatCampaignReport(rows) }], accessToken);
            }
          } else {
            await replyMessage(event.replyToken, [{ type: "text", text: "ขอบคุณที่ติดต่อเรา ทีมงานได้รับข้อความแล้ว" }], accessToken);
          }
        }
      } catch (err) {
        console.error("line-webhook event handling failed", err);
      }
    })
  );

  res.status(200).json({ ok: true });
}
