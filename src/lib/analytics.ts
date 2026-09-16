import type { RawCustomer, RawTransaction, Customer, Segment, ChurnRisk, CampaignRecord } from "./types";

const THAI_MONTH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export function thaiDate(d: Date): string {
  return d.toLocaleDateString("th-TH-u-ca-gregory", { day: "numeric", month: "short", year: "numeric" });
}

export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? "";
  return (a + b) || "?";
}

// Map a raw value to a 1-10 decile score against the full distribution.
// ponytail: percentile bucketing, not a real statistical z-score model —
// good enough for a demo RFM, swap for a proper RFM library if this ships.
function decileScore(value: number, sorted: number[]): number {
  if (sorted.length === 0) return 1;
  let rank = 0;
  for (const v of sorted) if (v <= value) rank++;
  const pct = rank / sorted.length;
  return Math.min(10, Math.max(1, Math.ceil(pct * 10)));
}

export function buildCustomers(
  customers: RawCustomer[],
  transactions: RawTransaction[],
  campaigns: CampaignRecord[],
  now: Date = new Date()
): Customer[] {
  const txByCustomer = new Map<string, RawTransaction[]>();
  for (const t of transactions) {
    const list = txByCustomer.get(t.customer_id) ?? [];
    list.push(t);
    txByCustomer.set(t.customer_id, list);
  }

  // First pass: raw recency/frequency/monetary per customer, for percentile scoring.
  const raw = customers.map((c) => {
    const txs = (txByCustomer.get(c.customer_id) ?? []).slice().sort(
      (a, b) => +new Date(a.purchase_datetime) - +new Date(b.purchase_datetime)
    );
    const monetary = txs.reduce((s, t) => s + Number(t.line_total || 0), 0);
    const frequency = txs.length;
    const lastPurchaseDate = txs.length ? new Date(txs[txs.length - 1].purchase_datetime) : null;
    const recencyDays = lastPurchaseDate
      ? Math.floor((+now - +lastPurchaseDate) / 86400000)
      : Math.floor((+now - +new Date(c.register_date)) / 86400000);
    return { c, txs, monetary, frequency, recencyDays, lastPurchaseDate };
  });

  const monetarySorted = raw.map((r) => r.monetary).sort((a, b) => a - b);
  const frequencySorted = raw.map((r) => r.frequency).sort((a, b) => a - b);
  // Invert recency: fewer days since last purchase = higher score.
  const recencySorted = raw.map((r) => -r.recencyDays).sort((a, b) => a - b);

  // Segment-wide product popularity, used for simple "customers also bought" recs.
  const productRevenue = new Map<string, number>();
  for (const t of transactions) {
    productRevenue.set(t.product_name, (productRevenue.get(t.product_name) ?? 0) + Number(t.line_total || 0));
  }
  const popularProducts = [...productRevenue.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);

  return raw.map(({ c, txs, monetary, frequency, recencyDays, lastPurchaseDate }) => {
    const recency = decileScore(-recencyDays, recencySorted);
    const freqScore = decileScore(frequency, frequencySorted);
    const monetaryScore = decileScore(monetary, monetarySorted);

    const churnRisk: ChurnRisk = recency <= 3 ? "High" : recency <= 6 ? "Medium" : "Low";

    const registeredDaysAgo = Math.floor((+now - +new Date(c.register_date)) / 86400000);
    const rfmTotal = recency + freqScore + monetaryScore;

    let segment: Segment;
    if (registeredDaysAgo <= 90 && frequency <= 1) segment = "New";
    else if (churnRisk === "High") segment = "Dormant";
    else if (rfmTotal >= 22 || c.member_tier === "Platinum") segment = "Premium";
    else segment = "Regular";

    // Monthly purchase history, last 6 calendar months relative to `now`.
    const purchaseHistory: { month: string; amount: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const amount = txs
        .filter((t) => {
          const td = new Date(t.purchase_datetime);
          return td.getFullYear() === d.getFullYear() && td.getMonth() === d.getMonth();
        })
        .reduce((s, t) => s + Number(t.line_total || 0), 0);
      purchaseHistory.push({ month: THAI_MONTH_SHORT[d.getMonth()], amount });
    }

    const boughtProducts = new Set(txs.map((t) => t.product_name));
    const recommendations = popularProducts
      .filter((p) => !boughtProducts.has(p))
      .slice(0, 3)
      .map((name) => ({ name, reason: `สินค้าขายดีที่ลูกค้าใน${segment} segment ยังไม่เคยซื้อ` }));

    return {
      id: c.customer_id,
      name: c.full_name,
      avatar: initials(c.full_name),
      phone: c.phone,
      email: c.email,
      province: c.province,
      registerDate: c.register_date,
      memberTier: c.member_tier,
      isActive: (c.is_active ?? "").toUpperCase() === "TRUE",
      segment,
      totalSpend: monetary,
      orderCount: frequency,
      lastPurchaseDate,
      lastPurchaseLabel: lastPurchaseDate ? thaiDate(lastPurchaseDate) : "ยังไม่เคยซื้อ",
      rfm: { recency, frequency: freqScore, monetary: monetaryScore },
      churnRisk,
      purchaseHistory,
      recommendations,
      transactions: txs,
    };
  });
}

export interface ProductStat {
  name: string;
  category: string;
  sold: number;
  revenue: number;
  trend: number;
}

export interface ProductPair {
  a: string;
  b: string;
  count: number;
  pct: number;
}

export interface CategoryGroup {
  name: string;
  count: number;
  revenue: number;
  items: string[];
}

export function buildProductStats(transactions: RawTransaction[]) {
  const byProduct = new Map<string, ProductStat>();
  for (const t of transactions) {
    const key = t.product_name;
    const cur = byProduct.get(key) ?? { name: t.product_name, category: t.category, sold: 0, revenue: 0, trend: 0 };
    cur.sold += Number(t.quantity || 0);
    cur.revenue += Number(t.line_total || 0);
    byProduct.set(key, cur);
  }

  // Trend: compare revenue in the first half vs second half of the dataset's
  // own date range (no real forecasting model — see README).
  const dates = transactions.map((t) => +new Date(t.purchase_datetime));
  const minD = Math.min(...dates);
  const maxD = Math.max(...dates);
  const mid = (minD + maxD) / 2;
  const firstHalf = new Map<string, number>();
  const secondHalf = new Map<string, number>();
  for (const t of transactions) {
    const bucket = +new Date(t.purchase_datetime) < mid ? firstHalf : secondHalf;
    bucket.set(t.product_name, (bucket.get(t.product_name) ?? 0) + Number(t.line_total || 0));
  }
  for (const [name, stat] of byProduct) {
    const f = firstHalf.get(name) ?? 0;
    const s = secondHalf.get(name) ?? 0;
    stat.trend = f > 0 ? ((s - f) / f) * 100 : s > 0 ? 100 : 0;
  }

  const topProducts = [...byProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  // Category groups replace the mockup's fictional behavioral "clusters" —
  // `category` is a real CSV column, so grouping by it is honest and simple.
  const catMap = new Map<string, CategoryGroup>();
  for (const p of byProduct.values()) {
    const g = catMap.get(p.category) ?? { name: p.category, count: 0, revenue: 0, items: [] };
    g.count += 1;
    g.revenue += p.revenue;
    g.items.push(p.name);
    catMap.set(p.category, g);
  }
  const categories = [...catMap.values()].sort((a, b) => b.revenue - a.revenue);

  // Co-purchase pairs: since each transaction row is a single-product sale,
  // "bought together" is computed at the customer level (distinct products a
  // customer has ever bought), not per-basket.
  const byCustomer = new Map<string, Set<string>>();
  for (const t of transactions) {
    const set = byCustomer.get(t.customer_id) ?? new Set<string>();
    set.add(t.product_name);
    byCustomer.set(t.customer_id, set);
  }
  const pairCounts = new Map<string, number>();
  const singleCounts = new Map<string, number>();
  for (const set of byCustomer.values()) {
    const items = [...set];
    for (const p of items) singleCounts.set(p, (singleCounts.get(p) ?? 0) + 1);
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const key = [items[i], items[j]].sort().join("|||");
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }
  const pairs: ProductPair[] = [...pairCounts.entries()]
    .map(([key, count]) => {
      const [a, b] = key.split("|||");
      const base = Math.max(singleCounts.get(a) ?? 1, singleCounts.get(b) ?? 1);
      return { a, b, count, pct: Math.round((count / base) * 100) };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return { topProducts, categories, pairs };
}
