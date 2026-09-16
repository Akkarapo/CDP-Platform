import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { useData } from "../lib/store";
import type { Segment } from "../lib/types";

const SEGMENT_COLOR: Record<Segment, string> = {
  Premium: "#1A1917",
  Regular: "#6B6860",
  New: "#A8A59F",
  Dormant: "#D5D1CC",
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
  return (
    <div className="rounded-xl px-4 py-3 text-xs" style={{ backgroundColor: "var(--color-ink)", color: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
      <div className="font-medium mb-1" style={{ color: "#A8A59F" }}>{label}</div>
      <div className="font-semibold text-sm">{Number(payload[0].value).toLocaleString("th-TH")} ฿</div>
    </div>
  );
}

function DonutTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-3 py-2 text-xs" style={{ backgroundColor: "var(--color-ink)", color: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
      <span className="font-medium">{payload[0].name}</span>
      <span className="ml-2 font-semibold">{payload[0].value}%</span>
    </div>
  );
}

export default function Dashboard() {
  const { customers, rawTransactions, campaigns, segmentCounts, loading } = useData();
  const [activeSegment, setActiveSegment] = useState<number | null>(null);

  const dailySales = useMemo(() => {
    if (rawTransactions.length === 0) return [];
    const maxDate = new Date(Math.max(...rawTransactions.map((t) => +new Date(t.purchase_datetime))));
    const byDay = new Map<string, number>();
    for (const t of rawTransactions) byDay.set(t.purchase_datetime.slice(0, 10), (byDay.get(t.purchase_datetime.slice(0, 10)) ?? 0) + Number(t.line_total || 0));
    const points: { date: string; amount: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(maxDate);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      points.push({ date: d.toLocaleDateString("th-TH-u-ca-gregory", { day: "numeric", month: "short" }), amount: byDay.get(key) ?? 0 });
    }
    return points;
  }, [rawTransactions]);

  const totalRevenue = useMemo(() => rawTransactions.reduce((s, t) => s + Number(t.line_total || 0), 0), [rawTransactions]);
  const totalOrders = customers.reduce((s, c) => s + c.orderCount, 0);
  const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const segmentData = (Object.keys(segmentCounts) as Segment[]).map((s) => ({
    name: s,
    value: customers.length ? Math.round((segmentCounts[s] / customers.length) * 100) : 0,
    color: SEGMENT_COLOR[s],
  }));

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

      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-3 rounded-2xl px-6 pt-6 pb-4" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <p className="text-sm font-semibold mb-1" style={{ color: "var(--color-ink)" }}>ยอดขายรายวัน</p>
          <p className="text-xs mb-5" style={{ color: "var(--color-ink-3)" }}>30 วันล่าสุดในข้อมูล (จากไฟล์ transactions.csv)</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailySales} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="0" stroke="var(--color-rule)" vertical={false} strokeWidth={1} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-ink-3)", fontFamily: "var(--font-sans)" }} tickLine={false} axisLine={false} interval={4} />
              <YAxis tick={{ fontSize: 10, fill: "var(--color-ink-3)", fontFamily: "var(--font-sans)" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={36} />
              <Tooltip content={<SaleTip />} cursor={{ stroke: "var(--color-ink-3)", strokeWidth: 1, strokeDasharray: "4 3" }} />
              <Line type="monotone" dataKey="amount" stroke="var(--color-ink)" strokeWidth={2} dot={false} activeDot={{ r: 5, fill: "var(--color-ink)", stroke: "white", strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="col-span-2 rounded-2xl px-6 pt-6 pb-5 flex flex-col" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <p className="text-sm font-semibold mb-1" style={{ color: "var(--color-ink)" }}>กลุ่มลูกค้า</p>
          <p className="text-xs mb-4" style={{ color: "var(--color-ink-3)" }}>สัดส่วนตาม Segment (คำนวณจาก RFM จริง)</p>
          <div className="flex-1 flex items-center justify-center">
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie
                  data={segmentData} cx="50%" cy="50%" innerRadius={52} outerRadius={76}
                  strokeWidth={2} stroke="var(--color-surface)" dataKey="value"
                  onMouseEnter={(_, i) => setActiveSegment(i)}
                  onMouseLeave={() => setActiveSegment(null)}
                >
                  {segmentData.map((s, i) => (
                    <Cell key={s.name} fill={s.color} opacity={activeSegment === null || activeSegment === i ? 1 : 0.45} style={{ cursor: "pointer", transition: "opacity 0.15s" }} />
                  ))}
                </Pie>
                <Tooltip content={<DonutTip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-1">
            {segmentData.map((s, i) => (
              <div key={s.name} className="flex items-center justify-between" style={{ opacity: activeSegment === null || activeSegment === i ? 1 : 0.45, transition: "opacity 0.15s" }}>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-xs" style={{ color: "var(--color-ink-2)" }}>{s.name}</span>
                </div>
                <span className="text-xs font-semibold" style={{ color: "var(--color-ink)" }}>{s.value}%</span>
              </div>
            ))}
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
