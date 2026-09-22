import type { VercelRequest, VercelResponse } from "@vercel/node";
import { addFriendUrl } from "./_lib/lineClient.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const channelId = process.env.LINE_CHANNEL_ID ?? null;
  const basicId = process.env.LINE_OA_BASIC_ID ?? null;
  const connected = Boolean(process.env.LINE_CHANNEL_SECRET && process.env.LINE_CHANNEL_ACCESS_TOKEN);

  res.status(200).json({
    connected,
    channelId,
    basicId,
    addFriendUrl: basicId ? addFriendUrl(basicId) : null,
  });
}
