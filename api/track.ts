import type { VercelRequest, VercelResponse } from "@vercel/node";
import { recordClick } from "./_lib/tracking.js";
import { oaMessageUrl } from "./_lib/lineClient.js";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function page(body: string): string {
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>รหัสยืนยัน</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F7F5F2;margin:0;padding:48px 20px;text-align:center;color:#1A1917">${body}</body></html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const campaignId = typeof req.query.c === "string" ? req.query.c : null;
  const code = await recordClick(campaignId);
  res.setHeader("Content-Type", "text/html; charset=utf-8");

  if (!code) {
    res.status(500).send(page(`<p>เกิดข้อผิดพลาด ลองใหม่อีกครั้ง</p>`));
    return;
  }

  const basicId = process.env.LINE_OA_BASIC_ID;
  const cta = basicId
    ? `<a href="${escapeHtml(oaMessageUrl(basicId, code))}" style="display:inline-block;margin-top:20px;background:#06C755;color:#fff;text-decoration:none;font-weight:600;padding:12px 28px;border-radius:999px">กลับไปวางรหัสใน LINE</a>`
    : "";

  res.status(200).send(page(`
    <p style="font-size:14px;color:#6B6862;margin-bottom:8px">คัดลอกรหัสนี้แล้วส่งกลับไปในแชท LINE OA เพื่อยืนยัน</p>
    <div style="font-size:40px;font-weight:700;letter-spacing:8px;background:#fff;border:1px solid #E5E1DA;border-radius:16px;padding:24px;margin:16px auto;max-width:320px">${escapeHtml(code)}</div>
    ${cta}
  `));
}
