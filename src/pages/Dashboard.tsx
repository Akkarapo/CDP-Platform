import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useData } from "../lib/store";
import { buildRfmMatrixStats, buildPeriodDiagnostics, classifyRfmCell, type PeriodDiagnostics } from "../lib/analytics";
import type { Customer, Segment } from "../lib/types";

const TIER_COLOR: Record<"good" | "watch" | "risk", { bg: string; color: string }> = {
  good: { bg: "#DCFCE7", color: "#166534" },
  watch: { bg: "#FEF3C7", color: "#92400E" },
  risk: { bg: "#FEE2E2", color: "#991B1B" },
};

const STATUS: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: "รออนุมัติ", bg: "#FEF3C7", color: "#92400E" },
  rejected: { label: "ไม่อนุมัติ", bg: "#FEE2E2", color: "#991B1B" },
  approved: { label: "อนุมัติแล้ว", bg: "#E0E7FF", color: "#3730A3" },
  cancelled: { label: "ยกเลิกแล้ว", bg: "#FEE2E2", color: "#991B1B" },
  sent: { label: "ส่งแล้ว", bg: "#DCFCE7", color: "#166534" },
};
const PAUSED_STATUS = { label: "หยุดชั่วคราว", bg: "#F3F4F6", color: "#6B7280" };

const KPI_STATUS_COLOR: Record<"good" | "bad" | "neutral", { bg: string; color: string }> = {
  good: { bg: "#DCFCE7", color: "#166534" },
  bad: { bg: "#FEE2E2", color: "#991B1B" },
  neutral: { bg: "#F3F4F6", color: "#6B7280" },
};

const THB = (n: number) => `฿${Math.round(n).toLocaleString("th-TH")}`;
const NUM = (n: number) => Math.round(n).toLocaleString("th-TH");
const PCT = (n: number) => `${n.toLocaleString("th-TH", { maximumFractionDigits: 1 })}%`;

function pctChange(cur: number, prev: number): number {
  if (prev === 0) return cur === 0 ? 0 : 100;
  return ((cur - prev) / prev) * 100;
}

type KpiKey = "sales" | "bills" | "aov" | "buyingCustomers" | "repeatRate" | "atRisk";

interface KpiCardData {
  key: KpiKey;
  label: string;
  current: number;
  previous: number;
  change: number;
  unit: "currency" | "count" | "percent";
  changeUnit: "pct" | "pt";
  status: "good" | "bad" | "neutral";
}

function buildKpi(
  key: KpiKey, label: string, cur: number, prev: number,
  unit: KpiCardData["unit"], polarity: "positive" | "negative", changeUnit: "pct" | "pt" = "pct"
): KpiCardData {
  const change = changeUnit === "pt" ? cur - prev : pctChange(cur, prev);
  const threshold = changeUnit === "pt" ? 2 : 3;
  const status: KpiCardData["status"] =
    Math.abs(change) < threshold ? "neutral" : (polarity === "positive" ? change > 0 : change < 0) ? "good" : "bad";
  return { key, label, current: cur, previous: prev, change, unit, changeUnit, status };
}

interface KpiSuggestion { objective: "increase_sales" | "retain_customers"; segment?: Segment; rfmFilter?: string }

// Which Objective + target group a KPI's root cause points toward — mirrors
// the objective-design doc's mapping (increase_sales -> Premium/Champions
// upsell moves, retain_customers -> At Risk win-back moves).
function suggestForKpi(key: KpiKey, current: PeriodDiagnostics, previous: PeriodDiagnostics): KpiSuggestion {
  if (key === "atRisk") return { objective: "retain_customers", rfmFilter: "at-risk" };
  if (key === "aov") return { objective: "increase_sales", segment: "Premium" };
  if (key === "sales") {
    const billsChange = pctChange(current.bills, previous.bills);
    const aovChange = pctChange(current.aov, previous.aov);
    return billsChange <= aovChange
      ? { objective: "retain_customers", rfmFilter: "at-risk" }
      : { objective: "increase_sales", segment: "Premium" };
  }
  return { objective: "retain_customers", rfmFilter: "at-risk" };
}

function KpiCard({ kpi, analyzing, onAnalyze }: { kpi: KpiCardData; analyzing: boolean; onAnalyze: () => void }) {
  const c = KPI_STATUS_COLOR[kpi.status];
  const valueFmt = kpi.unit === "currency" ? THB : kpi.unit === "percent" ? PCT : NUM;
  const arrow = kpi.change > 0 ? "▲" : kpi.change < 0 ? "▼" : "–";
  const deltaLabel = kpi.changeUnit === "pt"
    ? `${Math.abs(kpi.change).toLocaleString("th-TH", { maximumFractionDigits: 1 })} จุด`
    : `${Math.abs(kpi.change).toLocaleString("th-TH", { maximumFractionDigits: 1 })}%`;
  return (
    <div className="rounded-2xl px-5 py-4 flex flex-col gap-2" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
      <span className="text-xs font-medium tracking-wide uppercase" style={{ color: "var(--color-ink-3)" }}>{kpi.label}</span>
      <span className="text-2xl font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>{valueFmt(kpi.current)}</span>
      <div className="flex items-center gap-1.5 text-xs flex-wrap">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: c.bg, color: c.color }}>{arrow} {deltaLabel}</span>
        <span style={{ color: "var(--color-ink-3)" }}>เทียบช่วงก่อน {valueFmt(kpi.previous)}</span>
      </div>
      {kpi.status === "bad" && (
        <button onClick={onAnalyze} className="mt-1 self-start text-xs font-medium px-3 py-1.5 rounded-lg" style={{ backgroundColor: analyzing ? "var(--color-ink)" : "var(--color-ground)", color: analyzing ? "#fff" : "var(--color-ink-2)", border: "1px solid var(--color-rule)", cursor: "pointer" }}>
          วิเคราะห์สาเหตุ
        </button>
      )}
    </div>
  );
}

function RootCausePanel({ kpiKey, current, previous, customers, onClose, onCreateCampaign }: {
  kpiKey: KpiKey;
  current: PeriodDiagnostics;
  previous: PeriodDiagnostics;
  customers: Customer[];
  onClose: () => void;
  onCreateCampaign: (s: KpiSuggestion) => void;
}) {
  const suggestion = suggestForKpi(kpiKey, current, previous);
  const billsChange = pctChange(current.bills, previous.bills);
  const aovChange = pctChange(current.aov, previous.aov);

  let title = "";
  let rows: { label: string; cur: string; prev: string }[] = [];
  let actionText = "";
  let extra: ReactNode = null;

  if (kpiKey === "sales") {
    title = "ยอดขายลด = จำนวนบิล × AOV — ตัวไหนคือสาเหตุหลัก";
    rows = [
      { label: "จำนวนบิล", cur: `${NUM(current.bills)} (${billsChange >= 0 ? "+" : ""}${billsChange.toFixed(1)}%)`, prev: NUM(previous.bills) },
      { label: "AOV", cur: `${THB(current.aov)} (${aovChange >= 0 ? "+" : ""}${aovChange.toFixed(1)}%)`, prev: THB(previous.aov) },
    ];
    actionText = billsChange <= aovChange
      ? "จำนวนบิลลดมากกว่า AOV → ลูกค้าเดิมกลับมาซื้อน้อยลง แนะนำแคมเปญรักษาฐานลูกค้าเดิม (Reminder / Win-back)"
      : "AOV ลดมากกว่าจำนวนบิล → ลูกค้าซื้อต่อบิลน้อยลง แนะนำแคมเปญเพิ่มยอดขายด้วย Bundle / Cross-sell / Upsell";
  } else if (kpiKey === "bills" || kpiKey === "buyingCustomers" || kpiKey === "repeatRate") {
    title = "ลูกค้าใหม่ เทียบ ลูกค้าเดิมที่ซื้อซ้ำ";
    rows = [
      { label: "ลูกค้าใหม่ (ซื้อครั้งแรกในช่วงนี้)", cur: NUM(current.newCustomers), prev: NUM(previous.newCustomers) },
      { label: "ลูกค้าเดิมที่ซื้อซ้ำ", cur: NUM(current.repeatCustomers), prev: NUM(previous.repeatCustomers) },
      { label: "อัตราซื้อซ้ำ", cur: PCT(current.repeatRate), prev: PCT(previous.repeatRate) },
    ];
    const topBranch = current.branchBills[0];
    if (topBranch) {
      const prevBranch = previous.branchBills.find((b) => b.branch === topBranch.branch);
      rows.push({ label: `สาขาที่มีบิลมากสุด: ${topBranch.branch}`, cur: `${topBranch.bills} บิล`, prev: `${prevBranch?.bills ?? 0} บิล` });
    }
    actionText = "ลูกค้าเดิมกลับมาซื้อซ้ำน้อยลง แนะนำแคมเปญรักษาฐานลูกค้าเดิม เน้น Reminder หรือ Win-back สำหรับกลุ่มเสี่ยงหลุด";
  } else if (kpiKey === "aov") {
    title = "อะไรทำให้ AOV ลด";
    rows = [
      { label: "จำนวนชิ้นเฉลี่ย/บิล", cur: current.avgItemsPerBill.toFixed(2), prev: previous.avgItemsPerBill.toFixed(2) },
      { label: "ราคาเฉลี่ย/ชิ้น", cur: THB(current.avgPricePerItem), prev: THB(previous.avgPricePerItem) },
      { label: "สัดส่วนยอดขายจากกลุ่ม Premium/Champions", cur: PCT(current.premiumChampionsShare), prev: PCT(previous.premiumChampionsShare) },
    ];
    actionText = "แนะนำกระตุ้นด้วย Bundle, Cross-sell หรือ Upsell กับกลุ่มลูกค้าที่มีกำลังซื้อ (Premium / Champions)";
  } else if (kpiKey === "atRisk") {
    title = "ลูกค้า At Risk เพิ่มขึ้น";
    rows = [{ label: "จำนวนลูกค้า At Risk", cur: NUM(current.atRiskCount), prev: NUM(previous.atRiskCount) }];
    actionText = "ลูกค้ากลุ่มนี้เคยซื้อบ่อย/มูลค่าสูง แต่หายไปนาน แนะนำแคมเปญ Win-back หรือ Reminder เฉพาะบุคคลก่อนกลายเป็น Lost";
    const sample = customers
      .filter((c) => classifyRfmCell(c.rfm.recency, c.rfm.frequency, c.rfm.monetary).key === "at-risk")
      .sort((a, b) => b.recencyDays - a.recencyDays)
      .slice(0, 5);
    if (sample.length > 0) {
      extra = (
        <div className="mt-3">
          <p className="text-xs font-medium mb-1.5" style={{ color: "var(--color-ink-2)" }}>ตัวอย่างลูกค้า At Risk (ซื้อล่าสุดนานที่สุดก่อน)</p>
          <ul className="text-xs space-y-1" style={{ color: "var(--color-ink-2)" }}>
            {sample.map((c) => <li key={c.id}>{c.name} · ซื้อล่าสุด {c.lastPurchaseLabel}</li>)}
          </ul>
        </div>
      );
    }
  }

  return (
    <div className="rounded-2xl px-6 py-5" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>{title}</p>
        <button onClick={onClose} aria-label="ปิด" className="text-lg leading-none" style={{ color: "var(--color-ink-3)", background: "none", border: "none", cursor: "pointer" }}>×</button>
      </div>
      <div className="space-y-1.5 mb-3">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-xs gap-3">
            <span style={{ color: "var(--color-ink-3)" }}>{r.label}</span>
            <span className="font-medium text-right" style={{ color: "var(--color-ink)" }}>{r.cur} <span style={{ color: "var(--color-ink-3)", fontWeight: 400 }}>(ก่อนหน้า {r.prev})</span></span>
          </div>
        ))}
      </div>
      {extra}
      <p className="text-xs leading-relaxed mt-3 mb-4 rounded-xl px-3.5 py-3" style={{ backgroundColor: "var(--color-ground)", color: "var(--color-ink-2)" }}>{actionText}</p>
      <button onClick={() => onCreateCampaign(suggestion)} className="text-sm font-semibold px-4 py-2.5 rounded-xl" style={{ backgroundColor: "var(--color-ink)", color: "#fff", border: "none", cursor: "pointer" }}>
        สร้างแคมเปญจากผลการวิเคราะห์
      </button>
    </div>
  );
}

function SaleTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const items = payload.filter((p: any) => p.value != null);
  if (items.length === 0) return null;
  const NAME: Record<string, string> = { amount: "ยอดขายจริง", forecast: "พยากรณ์", previous: "ช่วงก่อนหน้า" };
  return (
    <div className="rounded-xl px-4 py-3 text-xs" style={{ backgroundColor: "var(--color-ink)", color: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
      <div className="font-medium mb-1.5" style={{ color: "#A8A59F" }}>{label}</div>
      {items.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span style={{ opacity: 0.75 }}>{NAME[p.dataKey] ?? p.dataKey}</span>
          <span className="font-semibold text-sm">{Number(p.value).toLocaleString("th-TH")} ฿</span>
        </div>
      ))}
    </div>
  );
}

const PERIOD_OPTIONS: { days: 7 | 30 | 90; label: string }[] = [
  { days: 7, label: "7 วันล่าสุด" },
  { days: 30, label: "30 วันล่าสุด" },
  { days: 90, label: "90 วันล่าสุด" },
];

export default function Dashboard() {
  const { customers, rawCustomers, rawTransactions, campaigns, loading } = useData();
  const navigate = useNavigate();
  const [periodDays, setPeriodDays] = useState<7 | 30 | 90>(30);
  const [analyzing, setAnalyzing] = useState<KpiKey | null>(null);

  const maxDate = useMemo(() => {
    if (rawTransactions.length === 0) return new Date();
    return new Date(Math.max(...rawTransactions.map((t) => +new Date(t.purchase_datetime))));
  }, [rawTransactions]);

  const dailySales = useMemo(() => {
    if (rawTransactions.length === 0) return [];
    const byDay = new Map<string, number>();
    for (const t of rawTransactions) byDay.set(t.purchase_datetime.slice(0, 10), (byDay.get(t.purchase_datetime.slice(0, 10)) ?? 0) + Number(t.line_total || 0));
    const fmt = (d: Date) => d.toLocaleDateString("th-TH-u-ca-gregory", { day: "numeric", month: "short" });

    const points: { date: string; amount: number | null; previous: number | null; forecast: number | null }[] = [];
    for (let i = periodDays - 1; i >= 0; i--) {
      const d = new Date(maxDate);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const prevD = new Date(d);
      prevD.setDate(prevD.getDate() - periodDays);
      const prevKey = prevD.toISOString().slice(0, 10);
      points.push({ date: fmt(d), amount: byDay.get(key) ?? 0, previous: byDay.get(prevKey) ?? 0, forecast: null });
    }

    // ponytail: naive least-squares trend line over the last 14 real calendar days
    // (independent of the selected comparison window), extrapolated 7 days forward —
    // not a real forecasting model (no seasonality, no ML).
    const recent: number[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(maxDate);
      d.setDate(d.getDate() - i);
      recent.push(byDay.get(d.toISOString().slice(0, 10)) ?? 0);
    }
    const n = recent.length;
    const sumX = recent.reduce((s, _y, x) => s + x, 0);
    const sumY = recent.reduce((s, y) => s + y, 0);
    const sumXY = recent.reduce((s, y, x) => s + x * y, 0);
    const sumXX = recent.reduce((s, _y, x) => s + x * x, 0);
    const denom = n * sumXX - sumX * sumX;
    const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
    const intercept = (sumY - slope * sumX) / n;

    points[points.length - 1].forecast = points[points.length - 1].amount;
    for (let i = 1; i <= 7; i++) {
      const d = new Date(maxDate);
      d.setDate(d.getDate() + i);
      points.push({ date: fmt(d), amount: null, previous: null, forecast: Math.max(0, Math.round(intercept + slope * (n - 1 + i))) });
    }
    return points;
  }, [rawTransactions, maxDate, periodDays]);

  const periodWindows = useMemo(() => {
    const dayMs = 86400000;
    const currentEnd = new Date(+maxDate + dayMs);
    const currentStart = new Date(+currentEnd - periodDays * dayMs);
    const previousEnd = currentStart;
    const previousStart = new Date(+previousEnd - periodDays * dayMs);
    return { currentStart, currentEnd, previousStart, previousEnd };
  }, [maxDate, periodDays]);

  const current = useMemo(
    () => rawTransactions.length ? buildPeriodDiagnostics(rawTransactions, rawCustomers, customers, periodWindows.currentStart, periodWindows.currentEnd) : null,
    [rawTransactions, rawCustomers, customers, periodWindows]
  );
  const previous = useMemo(
    () => rawTransactions.length ? buildPeriodDiagnostics(rawTransactions, rawCustomers, customers, periodWindows.previousStart, periodWindows.previousEnd) : null,
    [rawTransactions, rawCustomers, customers, periodWindows]
  );

  const kpis = useMemo<KpiCardData[]>(() => {
    if (!current || !previous) return [];
    return [
      buildKpi("sales", "ยอดขาย", current.sales, previous.sales, "currency", "positive"),
      buildKpi("bills", "จำนวนบิล", current.bills, previous.bills, "count", "positive"),
      buildKpi("aov", "AOV", current.aov, previous.aov, "currency", "positive"),
      buildKpi("buyingCustomers", "ลูกค้าที่ซื้อจริง", current.buyingCustomers, previous.buyingCustomers, "count", "positive"),
      buildKpi("repeatRate", "อัตราซื้อซ้ำ", current.repeatRate, previous.repeatRate, "percent", "positive", "pt"),
      buildKpi("atRisk", "ลูกค้า At Risk", current.atRiskCount, previous.atRiskCount, "count", "negative"),
    ];
  }, [current, previous]);

  function handleCreateCampaignFromAnalysis(s: KpiSuggestion) {
    navigate("/campaigns", { state: { preselectedObjective: s.objective, preselectedSegment: s.segment, preselectedRfmFilter: s.rfmFilter } });
  }

  const rfmMatrix = useMemo(() => buildRfmMatrixStats(customers), [customers]);

  // Mosaic-plot layout: each row's height follows that row's share of all
  // customers, and — independently, within each row — each cell's width
  // follows its own share of that row. Area then equals each cell's true
  // share of the total, not just a same-width-per-column grid.
  const rfmRows = useMemo(() => {
    return ([2, 1, 0] as const).map((fmBand) => {
      const cells = rfmMatrix.filter((c) => c.fmBand === fmBand);
      const total = cells.reduce((s, c) => s + c.count, 0);
      return { total: Math.max(total, 1), cells };
    });
  }, [rfmMatrix]);

  const recentCampaigns = campaigns.slice(0, 5);

  if (loading) {
    return <main className="max-w-5xl mx-auto px-6 py-8"><p style={{ color: "var(--color-ink-3)" }}>กำลังโหลดข้อมูล...</p></main>;
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>
            ภาพรวมระบบ
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-ink-3)" }}>
            ข้อมูลจากไฟล์ CSV — ลูกค้า {customers.length.toLocaleString("th-TH")} ราย, ธุรกรรม {rawTransactions.length.toLocaleString("th-TH")} รายการ, แคมเปญ {campaigns.length.toLocaleString("th-TH")} รายการ
          </p>
        </div>
        <div className="flex gap-1 rounded-xl p-1" style={{ backgroundColor: "var(--color-ground)" }}>
          {PERIOD_OPTIONS.map((opt) => {
            const active = periodDays === opt.days;
            return (
              <button key={opt.days} onClick={() => { setPeriodDays(opt.days); setAnalyzing(null); }} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: active ? "var(--color-ink)" : "transparent", color: active ? "#fff" : "var(--color-ink-2)", border: "none", cursor: "pointer" }}>
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-xs -mt-4" style={{ color: "var(--color-ink-3)" }}>เทียบกับ {periodDays} วันก่อนหน้าช่วงนี้ — การ์ดที่มีเครื่องหมาย ▼ สีแดง แปลว่าแย่ลงผิดปกติ กดปุ่ม "วิเคราะห์สาเหตุ" เพื่อดูรายละเอียด</p>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {kpis.map((k) => (
          <KpiCard key={k.key} kpi={k} analyzing={analyzing === k.key} onAnalyze={() => setAnalyzing((cur) => (cur === k.key ? null : k.key))} />
        ))}
      </div>

      {analyzing && current && previous && (
        <RootCausePanel
          kpiKey={analyzing}
          current={current}
          previous={previous}
          customers={customers}
          onClose={() => setAnalyzing(null)}
          onCreateCampaign={handleCreateCampaignFromAnalysis}
        />
      )}

      <div className="rounded-2xl px-6 pt-6 pb-4" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <p className="text-sm font-semibold mb-1" style={{ color: "var(--color-ink)" }}>ยอดขายรายวัน</p>
          <p className="text-xs mb-5" style={{ color: "var(--color-ink-3)" }}>{periodDays} วันล่าสุดในข้อมูล เทียบกับ {periodDays} วันก่อนหน้า + พยากรณ์ 7 วันข้างหน้า (แนวโน้มเชิงเส้นอย่างง่าย ไม่ใช่โมเดล ML)</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailySales} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="0" stroke="var(--color-rule)" vertical={false} strokeWidth={1} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-ink-3)", fontFamily: "var(--font-sans)" }} tickLine={false} axisLine={false} interval={Math.max(0, Math.ceil(periodDays / 7) - 1)} />
              <YAxis tick={{ fontSize: 10, fill: "var(--color-ink-3)", fontFamily: "var(--font-sans)" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={36} />
              <Tooltip content={<SaleTip />} cursor={{ stroke: "var(--color-ink-3)", strokeWidth: 1, strokeDasharray: "4 3" }} />
              <Line type="monotone" dataKey="previous" stroke="var(--color-ink-3)" strokeWidth={1.5} strokeDasharray="2 3" dot={false} connectNulls={false} opacity={0.7} />
              <Line type="monotone" dataKey="amount" stroke="var(--color-ink)" strokeWidth={2} dot={false} connectNulls={false} activeDot={{ r: 5, fill: "var(--color-ink)", stroke: "white", strokeWidth: 2 }} />
              <Line type="monotone" dataKey="forecast" stroke="var(--color-ink-3)" strokeWidth={2} strokeDasharray="4 4" dot={false} connectNulls={true} activeDot={{ r: 5, fill: "var(--color-ink-3)", stroke: "white", strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-ink-2)" }}>
              <span className="inline-block w-3 h-0.5" style={{ backgroundColor: "var(--color-ink)" }} /> ยอดขายจริง
            </span>
            <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-ink-2)" }}>
              <span className="inline-block w-3 h-0.5" style={{ backgroundColor: "var(--color-ink-3)", backgroundImage: "repeating-linear-gradient(90deg, var(--color-ink-3) 0 2px, transparent 2px 4px)" }} /> ช่วงก่อนหน้า
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
            <div className="flex flex-col gap-3" style={{ height: 480 }}>
              {rfmRows.map((row, ri) => (
                <div key={ri} className="flex gap-3" style={{ flexGrow: row.total, flexBasis: 0, minHeight: 84 }}>
                  {row.cells.map((cell) => {
                    const c = TIER_COLOR[cell.tier];
                    return (
                      <div
                        key={cell.key}
                        title={cell.description}
                        className="rounded-xl p-3.5 flex flex-col justify-between overflow-hidden"
                        style={{ backgroundColor: c.bg, flexGrow: Math.max(cell.count, 1), flexBasis: 0, minWidth: 100 }}
                      >
                        <p className="text-sm font-semibold leading-snug" style={{ color: c.color }}>{cell.label}</p>
                        <div className="flex items-end justify-between">
                          <span className="text-xl font-semibold tabular-nums" style={{ color: c.color }}>{cell.count.toLocaleString("th-TH")}</span>
                          <span className="text-xs font-medium tabular-nums" style={{ color: c.color, opacity: 0.85 }}>{cell.pct}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <p className="text-xs text-center mt-2" style={{ color: "var(--color-ink-3)" }}>Recency → (วางเมาส์บนช่องเพื่อดูคำอธิบาย)</p>
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
                const s = c.paused ? PAUSED_STATUS : STATUS[c.status];
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
