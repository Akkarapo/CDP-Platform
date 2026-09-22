import type { VercelRequest, VercelResponse } from "@vercel/node";
import { syncFollowers } from "./_lib/lineUsers.js";
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

  try {
    const synced = await syncFollowers(accessToken);
    res.status(200).json({ ok: true, synced });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "ซิงค์ผู้ติดตามไม่สำเร็จ" });
  }
}
