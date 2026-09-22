import { createHmac, timingSafeEqual } from "node:crypto";

const LINE_API_BASE = "https://api.line.me/v2/bot";

export interface LineTextMessage {
  type: "text";
  text: string;
}

export interface LineImageMessage {
  type: "image";
  originalContentUrl: string;
  previewImageUrl: string;
}

export type LineMessage = LineTextMessage | LineImageMessage;

export interface LineWebhookEvent {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { type: string; text?: string };
}

export interface LineWebhookBody {
  destination: string;
  events: LineWebhookEvent[];
}

export function verifyLineSignature(rawBody: Buffer, signature: string | undefined, channelSecret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", channelSecret).update(rawBody).digest("base64");
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

async function callMessagingApi(path: string, body: unknown, accessToken: string) {
  const res = await fetch(`${LINE_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`LINE API ${path} ล้มเหลว (${res.status}): ${detail || res.statusText}`);
  }
}

export function replyMessage(replyToken: string, messages: LineMessage[], accessToken: string) {
  return callMessagingApi("/message/reply", { replyToken, messages }, accessToken);
}

export function pushMessage(to: string, messages: LineMessage[], accessToken: string) {
  return callMessagingApi("/message/push", { to, messages }, accessToken);
}

// Sends the same messages to up to 500 recipients in one call.
export function multicastMessage(to: string[], messages: LineMessage[], accessToken: string) {
  return callMessagingApi("/message/multicast", { to, messages }, accessToken);
}

export function addFriendUrl(basicId: string): string {
  return `https://line.me/R/ti/p/${encodeURIComponent(basicId)}`;
}

// Opens a chat with the OA with `text` pre-filled in the input box (not sent).
export function oaMessageUrl(basicId: string, text: string): string {
  return `https://line.me/R/oaMessage/${encodeURIComponent(basicId)}/?${encodeURIComponent(text)}`;
}

export interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
}

export async function getProfile(userId: string, accessToken: string): Promise<LineProfile | null> {
  const res = await fetch(`${LINE_API_BASE}/profile/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as LineProfile;
}

// Everyone who has ever added this OA as a friend, not just people who have
// messaged it — capped to bound execution time on a single request.
export async function getFollowerIds(accessToken: string, maxUsers = 1000): Promise<string[]> {
  const ids: string[] = [];
  let start: string | undefined;
  do {
    const url = new URL(`${LINE_API_BASE}/followers/ids`);
    url.searchParams.set("limit", "1000");
    if (start) url.searchParams.set("start", start);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) break;
    const data = (await res.json()) as { userIds: string[]; next?: string };
    ids.push(...data.userIds);
    start = data.next;
  } while (start && ids.length < maxUsers);
  return ids.slice(0, maxUsers);
}
