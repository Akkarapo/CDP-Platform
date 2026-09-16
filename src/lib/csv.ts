// Minimal CSV parser — good enough for this dataset (no embedded commas/quotes
// inside fields). ponytail: swap for a real parser (papaparse) if source data
// ever needs quoted-field support.
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = (cells[i] ?? "").trim()));
    return row;
  });
}

export async function fetchCsv(url: string): Promise<Record<string, string>[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return parseCsv(await res.text());
}

// Serialize rows back to CSV text (used when persisting imported rows isn't
// needed — kept tiny, only used for re-export if a page ever needs it).
export function toCsv(rows: Record<string, string>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => r[h] ?? "").join(","));
  return lines.join("\n");
}
