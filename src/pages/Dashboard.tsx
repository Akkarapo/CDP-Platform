import { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useData } from "../lib/store";
import { buildRfmMatrixStats } from "../lib/analytics";

const TIER_COLOR: Record<"good" | "watch" | "risk", { bg: string; color: string }> = {
  good: { bg: "#DCFCE7", color: "#166534" },
  watch: { bg: "#FEF3C7", color: "#92400E" },
  risk: { bg: "#FEE2E2", color: "#991B1B" },
};

const STATUS: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: "รออนุมัติ", bg: "#FEF3C7", color: "#92400E" },
  approved: { label: "อนุมัติแล้ว", bg: "#E0E7FF", color: "#3730A3" },
  sent: { label: "ส่งแล้ว", bg: "#DCFCE7", color: "#166534" },
};

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      className="flex-1 rounded-2xl px-6 py-5 flex flex-col gap-2"
      style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}
    >
      <span className="text-xs font-medium tracking-wide uppercase" style={{ color: "var(--color-ink-3)" }}>{label}</span>
      <span className="text-3xl font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>{value}</span>
      {sub && <span className="text-xs" style={{ color: "var(--color-ink-2)" }}>{sub}</span>}
    </div>
  );
}

function SaleTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const point = payload.find((p: any) => p.dataKey === "amount" && p.value != null) ?? payload.find((p: any) => p.dataKey === "forecast" && p.value != null);
  if (!point) return null;
  const isForecast = point.dataKey === "forecast";
  return (
    <div className="rounded-xl px-4 py-3 text-xs" style={{ backgroundColor: "var(--color-ink)", color: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
      <div className="font-medium mb-1" style={{ color: "#A8A59F" }}>{label}{isForecast ? " (พยากรณ์)" : ""}</div>
      <div className="font-semibold text-sm">{Number(point.value).toLocaleString("th-TH")} ฿</div>
    </div>
  );
}

export default function Dashboard() {
  const { customers, rawTransactions, campaigns, loading } = useData();

  const dailySales = useMemo(() => {
    if (rawTransactions.length === 0) return [];
    const maxDate = new Date(Math.max(...rawTransactions.map((t) => +new Date(t.purchase_datetime))));
    const byDay = new Map<string, number>();
    for (const t of rawTransactions) byDay.set(t.purchase_datetime.slice(0, 10), (byDay.get(t.purchase_datetime.slice(0, 10)) ?? 0) + Number(t.line_total || 0));
    const fmt = (d: Date) => d.toLocaleDateString("th-TH-u-ca-gregory", { day: "numeric", month: "short" });

    const points: { date: string; amount: number | null; forecast: number | null }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(maxDate);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      points.push({ date: fmt(d), amount: byDay.get(key) ?? 0, forecast: null });
    }

    // ponytail: naive least-squares trend line over the last 14 real days, extrapolated
    // 7 days forward — not a real forecasting model (no seasonality, no ML). Upgrade to a
    // proper time-series model (e.g. Prophet-style) if this ever needs to be accurate.
    const recent = points.slice(-14).map((p, i) => [i, p.amount as number] as const);
    const n = recent.length;
    const sumX = recent.reduce((s, [x]) => s + x, 0);
    const sumY = recent.reduce((s, [, y]) => s + y, 0);
    const sumXY = recent.reduce((s, [x, y]) => s + x * y, 0);
    const sumXX = recent.reduce((s, [x]) => s + x * x, 0);
    const denom = n * sumXX - sumX * sumX;
    const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
    const intercept = (sumY - slope * sumX) / n;

    points[points.length - 1].forecast = points[points.length - 1].amount;
    for (let i = 1; i <= 7; i++) {
      const d = new Date(maxDate);
      d.setDate(d.getDate() + i);
      points.push({ date: fmt(d), amount: null, forecast: Math.max(0, Math.round(intercept + slope * (n - 1 + i))) });
    }
    return points;
  }, [rawTransactions]);

  const totalRevenue = useMemo(() => rawTransactions.reduce((s, t) => s + Number(t.line_total || 0), 0), [rawTransactions]);
  const totalOrders = customers.reduce((s, c) => s + c.orderCount, 0);
  const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const rfmMatrix = useMemo(() => buildRfmMatrixStats(customers), [customers]);

  // Track sizes follow real customer counts (treemap-style) instead of an
  // even 3x3 split, so a segment's box visibly reflects how many people are
  // actually in it. A floor keeps near-empty segments legible.
  const rfmTracks = useMemo(() => {
    const colTotal = (band: 0 | 1 | 2) => rfmMatrix.filter((c) => c.rBand === band).reduce((s, c) => s + c.count, 0);
    const rowTotal = (band: 0 | 1 | 2) => rfmMatrix.filter((c) => c.fmBand === band).reduce((s, c) => s + c.count, 0);
    const cols = ([0, 1, 2] as const).map((b) => Math.max(colTotal(b), 1));
    const rows = ([2, 1, 0] as const).map((b) => Math.max(rowTotal(b), 1));
    return {
      gridTemplateColumns: cols.map((v) => `minmax(120px, ${v}fr)`).join(" "),
      gridTemplateRows: rows.map((v) => `minmax(92px, ${v}fr)`).join(" "),
    };
  }, [rfmMatrix]);

  const recentCampaigns = campaigns.slice(0, 5);

  if (loading) {
    return <main className="max-w-5xl mx-auto px-6 py-8"><p style={{ color: "var(--color-ink-3)" }}>กำลังโหลดข้อมูล...</p></main>;
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>
          ภาพรวมระบบ
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--color-ink-3)" }}>
          ข้อมูลจากไฟล์ CSV — ลูกค้า {customers.length.toLocaleString("th-TH")} ราย, ธุรกรรม {rawTransactions.length.toLocaleString("th-TH")} รายการ
        </p>
      </div>

      <div className="flex gap-4">
        <StatCard label="ลูกค้าทั้งหมด" value={customers.length.toLocaleString("th-TH")} sub="จากไฟล์ customers.csv" />
        <StatCard label="ยอดขายรวมทั้งหมด" value={`฿${totalRevenue.toLocaleString("th-TH")}`} sub={`${rawTransactions.length.toLocaleString("th-TH")} รายการ`} />
        <StatCard label="แคมเปญที่สร้างแล้ว" value={campaigns.length.toLocaleString("th-TH")} sub={`${campaigns.filter((c) => c.status === "sent").length} ส่งแล้ว`} />
        <StatCard label="มูลค่าเฉลี่ย/ออเดอร์ (AOV)" value={`฿${aov.toLocaleString("th-TH", { maximumFractionDigits: 0 })}`} sub="คำนวณจากข้อมูลจริง" />
      </div>

      <div className="rounded-2xl px-6 pt-6 pb-4" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <p className="text-sm font-semibold mb-1" style={{ color: "var(--color-ink)" }}>ยอดขายรายวัน</p>
          <p className="text-xs mb-5" style={{ color: "var(--color-ink-3)" }}>30 วันล่าสุดในข้อมูล + พยากรณ์ 7 วันข้างหน้า (แนวโน้มเชิงเส้นอย่างง่าย ไม่ใช่โมเดล ML)</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailySales} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="0" stroke="var(--color-rule)" vertical={false} strokeWidth={1} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-ink-3)", fontFamily: "var(--font-sans)" }} tickLine={false} axisLine={false} interval={4} />
              <YAxis tick={{ fontSize: 10, fill: "var(--color-ink-3)", fontFamily: "var(--font-sans)" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={36} />
              <Tooltip content={<SaleTip />} cursor={{ stroke: "var(--color-ink-3)", strokeWidth: 1, strokeDasharray: "4 3" }} />
              <Line type="monotone" dataKey="amount" stroke="var(--color-ink)" strokeWidth={2} dot={false} connectNulls={false} activeDot={{ r: 5, fill: "var(--color-ink)", stroke: "white", strokeWidth: 2 }} />
              <Line type="monotone" dataKey="forecast" stroke="var(--color-ink-3)" strokeWidth={2} strokeDasharray="4 4" dot={false} connectNulls={true} activeDot={{ r: 5, fill: "var(--color-ink-3)", stroke: "white", strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2">
            <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-ink-2)" }}>
              <span className="inline-block w-3 h-0.5" style={{ backgroundColor: "var(--color-ink)" }} /> ยอดขายจริง
            </span>
            <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-ink-2)" }}>
              <span className="inline-block w-3 h-0.5" style={{ backgroundColor: "var(--color-ink-3)", backgroundImage: "repeating-linear-gradient(90deg, var(--color-ink-3) 0 3px, transparent 3px 6px)" }} /> พยากรณ์ 7 วัน
            </span>
          </div>
      </div>

      <div className="rounded-2xl px-6 pt-6 pb-6" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <p className="text-sm font-semibold mb-1" style={{ color: "var(--color-ink)" }}>กลุ่มลูกค้าตาม RFM</p>
        <p className="text-xs mb-5" style={{ color: "var(--color-ink-3)" }}>Recency (แกนนอน) x Frequency &amp; Monetary (แกนตั้ง) — คำนวณสดจากข้อมูลลูกค้าจริงทั้งหมด</p>
        <div className="flex gap-3">
          <div className="flex flex-col items-center justify-center pb-6" style={{ width: 20 }}>
            <span
              className="text-xs font-medium tracking-wide uppercase whitespace-nowrap"
              style={{ color: "var(--color-ink-3)", writingMode: "vertical-rl", transform: "rotate(180deg)" }}
            >
              Frequency &amp; Monetary ↑
            </span>
          </div>
          <div className="flex-1">
            <div className="grid gap-3" style={rfmTracks}>
              {rfmMatrix.map((cell) => {
                const c = TIER_COLOR[cell.tier];
                return (
                  <div key={cell.key} className="rounded-xl p-3.5 flex flex-col justify-between overflow-hidden" style={{ backgroundColor: c.bg }}>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: c.color }}>{cell.label}</p>
                      <p className="text-xs mt-1 leading-snug" style={{ color: c.color, opacity: 0.85 }}>{cell.description}</p>
                    </div>
                    <div className="flex items-end justify-between mt-2">
                      <span className="text-xl font-semibold tabular-nums" style={{ color: c.color }}>{cell.count.toLocaleString("th-TH")}</span>
                      <span className="text-xs font-medium tabular-nums" style={{ color: c.color, opacity: 0.85 }}>{cell.pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-center mt-2" style={{ color: "var(--color-ink-3)" }}>Recency →</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div className="px-6 py-5" style={{ borderBottom: "1px solid var(--color-rule)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>แคมเปญล่าสุด</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>
            {recentCampaigns.length === 0 ? "ยังไม่มีแคมเปญ — สร้างได้ที่หน้า Campaigns" : `${recentCampaigns.length} รายการล่าสุด`}
          </p>
        </div>
        {recentCampaigns.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-rule)" }}>
                {["ชื่อแคมเปญ", "กลุ่มเป้าหมาย", "สถานะ"].map((h, i) => (
                  <th key={h} className={`px-6 py-3 text-xs font-medium tracking-wide uppercase ${i === 2 ? "text-right" : "text-left"}`} style={{ color: "var(--color-ink-3)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentCampaigns.map((c, i) => {
                const s = STATUS[c.status];
                return (
                  <tr key={c.id} style={{ borderBottom: i < recentCampaigns.length - 1 ? "1px solid var(--color-rule)" : "none" }}>
                    <td className="px-6 py-4 font-medium" style={{ color: "var(--color-ink)" }}>{c.name}</td>
                    <td className="px-6 py-4 text-sm" style={{ color: "var(--color-ink-2)" }}>{c.targetSegment}</td>
                    <td className="px-6 py-4 text-right">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: s.bg, color: s.color }}>
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                        {s.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
