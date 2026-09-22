import type { VercelRequest, VercelResponse } from "@vercel/node";
import { pushMessage } from "./_lib/lineClient.js";
import { requireWorkspaceRole } from "./_lib/auth.js";

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

  const { to, text } = req.body as { to?: string; text?: string };
  if (!to?.trim() || !text?.trim()) {
    res.status(400).json({ error: "กรุณาระบุ LINE User ID และข้อความ" });
    return;
  }

  try {
    await pushMessage(to.trim(), [{ type: "text", text: text.trim() }], accessToken);
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "ส่งข้อความไม่สำเร็จ" });
  }
}
