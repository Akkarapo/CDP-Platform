import type { VercelRequest, VercelResponse } from "@vercel/node";
import { generateCampaign, type GenerateCampaignInput } from "./_lib/generateCampaign";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const input = req.body as GenerateCampaignInput;
    const result = await generateCampaign(input);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด" });
  }
}
