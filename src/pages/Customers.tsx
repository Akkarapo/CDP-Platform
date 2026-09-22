import { useMemo, useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { useData, usePastCustomer } from "../lib/store";
import { classifyRfmCell, recommendGoalCell } from "../lib/analytics";
import type { Customer, Segment, ChurnRisk } from "../lib/types";
import type { RfmCell } from "../lib/analytics";

const SEGMENT_META: Record<Segment, { bg: string; color: string }> = {
  Premium: { bg: "#1A1917", color: "#ffffff" },
  Regular: { bg: "#E0E7FF", color: "#3730A3" },
  New: { bg: "#DCFCE7", color: "#166534" },
  Dormant: { bg: "#F3F4F6", color: "#6B7280" },
};

const CHURN_META: Record<ChurnRisk, { bg: string; color: string; label: string }> = {
  Low: { bg: "#DCFCE7", color: "#166534", label: "ความเสี่ยงต่ำ" },
  Medium: { bg: "#FEF3C7", color: "#92400E", label: "ความเสี่ยงปานกลาง" },
  High: { bg: "#FEE2E2", color: "#991B1B", label: "ความเสี่ยงสูง" },
};

const RFM_TIER_META: Record<RfmCell["tier"], { bg: string; color: string }> = {
  good: { bg: "#DCFCE7", color: "#166534" },
  watch: { bg: "#FEF3C7", color: "#92400E" },
  risk: { bg: "#FEE2E2", color: "#991B1B" },
};

function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: bg, color }}>
      {label}
    </span>
  );
}

function PurchaseTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-3 py-2 text-xs" style={{ backgroundColor: "var(--color-ink)", color: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
      <div className="mb-0.5" style={{ color: "#A8A59F" }}>{label}</div>
      <div className="font-semibold">{Number(payload[0].value).toLocaleString("th-TH")} ฿</div>
    </div>
  );
}

function CustomerDrawer({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const { campaigns } = useData();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const churn = CHURN_META[customer.churnRisk];
  const seg = SEGMENT_META[customer.segment];
  const receivedCampaigns = campaigns.filter((c) => c.targetSegment === customer.segment || c.targetSegment === "ทุก Segment");
  const pastCustomer = usePastCustomer(customer.id);
  const currentCell = classifyRfmCell(customer.rfm.recency, customer.rfm.frequency, customer.rfm.monetary);
  const pastCell = pastCustomer ? classifyRfmCell(pastCustomer.rfm.recency, pastCustomer.rfm.frequency, pastCustomer.rfm.monetary) : null;
  const goalCell = recommendGoalCell(currentCell, customer.churnRisk);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(26,25,23,0.35)", backdropFilter: "blur(2px)" }} onClick={onClose} />
      <div
        className="relative w-full max-w-md flex flex-col overflow-hidden"
        style={{ backgroundColor: "var(--color-surface)", borderLeft: "1px solid var(--color-rule)", boxShadow: "-8px 0 32px rgba(0,0,0,0.12)", animation: "slideIn 0.22s cubic-bezier(0.16,1,0.3,1)" }}
      >
        <div className="flex items-start justify-between px-6 pt-6 pb-5" style={{ borderBottom: "1px solid var(--color-rule)" }}>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-semibold flex-shrink-0" style={{ backgroundColor: "var(--color-ink)", color: "#fff", fontFamily: "var(--font-sans)" }}>
              {customer.avatar}
            </div>
            <div>
              <h2 className="text-base font-semibold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>{customer.name}</h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>{customer.phone} · {customer.email}</p>
              <div className="flex items-center gap-2 mt-2">
                <Badge label={customer.segment} bg={seg.bg} color={seg.color} />
                <Badge label={churn.label} bg={churn.bg} color={churn.color} />
                <Badge label={customer.memberTier} bg="#F3F4F6" color="#6B7280" />
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: "var(--color-ink-3)", background: "none", border: "none", cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl p-4" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)" }}>
              <p className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--color-ink-3)" }}>ยอดซื้อสะสม</p>
              <p className="text-xl font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>฿{customer.totalSpend.toLocaleString("th-TH")}</p>
            </div>
            <div className="rounded-xl p-4" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)" }}>
              <p className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--color-ink-3)" }}>แต้มสะสม</p>
              <p className="text-xl font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>{customer.pointsBalance.toLocaleString("th-TH")}</p>
            </div>
            <div className="rounded-xl p-4" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)" }}>
              <p className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--color-ink-3)" }}>ซื้อล่าสุด</p>
              <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>{customer.lastPurchaseLabel}</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--color-ink-3)" }}>เส้นทางกลุ่มลูกค้า</p>
            <div className="flex items-start justify-between">
              {[
                { label: "6 เดือนก่อน", cell: pastCell },
                { label: "ปัจจุบัน", cell: currentCell as RfmCell | null },
                { label: "เป้าหมายที่แนะนำ", cell: goalCell as RfmCell | null },
              ].map((step, i, arr) => {
                const meta = step.cell ? RFM_TIER_META[step.cell.tier] : null;
                return (
                  <div key={step.label} className="flex items-start" style={{ flex: i < arr.length - 1 ? 1 : "0 0 auto" }}>
                    <div className="flex flex-col items-center gap-1.5 flex-shrink-0" style={{ width: 84 }}>
                      <div
                        className="w-20 h-20 rounded-full flex items-center justify-center text-[10px] font-semibold text-center leading-tight px-1.5"
                        style={{ backgroundColor: meta ? meta.bg : "#F3F4F6", color: meta ? meta.color : "var(--color-ink-3)", border: "1px solid var(--color-rule)" }}
                      >
                        {step.cell?.label ?? "ไม่มีข้อมูล"}
                      </div>
                      <span className="text-[11px] text-center" style={{ color: "var(--color-ink-3)" }}>{step.label}</span>
                    </div>
                    {i < arr.length - 1 && (
                      <div className="flex items-center flex-1 mx-1.5" style={{ marginTop: 35 }}>
                        <div className="flex-1" style={{ height: 1.5, backgroundColor: "var(--color-rule)" }} />
                        <svg width="8" height="10" viewBox="0 0 8 10" fill="none" className="flex-shrink-0" style={{ color: "var(--color-ink-3)" }}>
                          <path d="M0 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] mt-2.5" style={{ color: "var(--color-ink-3)" }}>
              "เป้าหมายที่แนะนำ" คือกลุ่ม RFM ที่ควรผลักดันลูกค้าไปให้ถึงจากสถานะปัจจุบัน (ดึงกลับ / รักษาฐาน / เพิ่มยอดขาย) ไม่ใช่การพยากรณ์
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--color-ink-3)" }}>RFM Score (จากข้อมูลจริง)</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Recency", value: `${customer.recencyDays.toLocaleString("th-TH")} วันก่อน`, point: customer.rfm.recency },
                { label: "Frequency", value: `${customer.orderCount.toLocaleString("th-TH")} ครั้ง`, point: customer.rfm.frequency },
                { label: "Monetary", value: `฿${customer.totalSpend.toLocaleString("th-TH")}`, point: customer.rfm.monetary },
              ].map(({ label, value, point }) => (
                <div key={label} className="rounded-xl p-3.5" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)" }}>
                  <p className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--color-ink-3)" }}>{label}</p>
                  <p className="text-base font-semibold tabular-nums leading-tight whitespace-nowrap" style={{ color: "var(--color-ink)" }}>{value}</p>
                  <p className="text-xs mt-1" style={{ color: "var(--color-ink-3)" }}>Point {point}/10</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--color-ink-3)" }}>ประวัติการซื้อ (6 เดือนล่าสุด)</p>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={customer.purchaseHistory} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barSize={20}>
                <CartesianGrid strokeDasharray="0" stroke="var(--color-rule)" vertical={false} strokeWidth={1} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--color-ink-3)", fontFamily: "var(--font-sans)" }} tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip content={<PurchaseTip />} cursor={{ fill: "var(--color-ground)" }} />
                <Bar dataKey="amount" fill="var(--color-ink)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--color-ink-3)" }}>แคมเปญที่ตรงกับกลุ่มลูกค้านี้</p>
            {receivedCampaigns.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--color-ink-3)" }}>ยังไม่มีแคมเปญสำหรับกลุ่มนี้</p>
            ) : (
              <div className="space-y-2">
                {receivedCampaigns.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-xl px-4 py-3" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)" }}>
                    <div>
                      <p className="text-xs font-medium" style={{ color: "var(--color-ink)" }}>{c.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>สร้างเมื่อ {new Date(c.createdAt).toLocaleDateString("th-TH-u-ca-gregory")}</p>
                    </div>
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ backgroundColor: "#E0E7FF", color: "#3730A3" }}>{c.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--color-ink-3)" }}>สินค้าที่น่าแนะนำ</p>
            {customer.recommendations.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--color-ink-3)" }}>ไม่มีคำแนะนำเพิ่มเติม</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {customer.recommendations.map((r) => (
                  <div key={r.name} className="rounded-xl px-3 py-3 flex flex-col gap-1.5" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)" }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--color-ink)" }}>
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 1l1.2 3.6L12 5.5l-2.9 2.7.8 3.8L7 10.2l-2.9 1.8.8-3.8L2 5.5l3.8-.9L7 1z" stroke="white" strokeWidth="1.2" strokeLinejoin="round" /></svg>
                    </div>
                    <p className="text-xs font-semibold leading-snug" style={{ color: "var(--color-ink)" }}>{r.name}</p>
                    <p className="text-xs leading-snug" style={{ color: "var(--color-ink-3)" }}>{r.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`@keyframes slideIn { from { transform: translateX(100%); opacity: 0.6; } to { transform: translateX(0); opacity: 1; } }`}</style>
    </div>
  );
}

const SPEND_RANGES = [
  { label: "ทั้งหมด", min: 0, max: Infinity },
  { label: "< ฿10,000", min: 0, max: 10000 },
  { label: "฿10,000 – ฿50,000", min: 10000, max: 50000 },
  { label: "฿50,000 – ฿100,000", min: 50000, max: 100000 },
  { label: "> ฿100,000", min: 100000, max: Infinity },
];

const SEGMENTS: (Segment | "ทั้งหมด")[] = ["ทั้งหมด", "Premium", "Regular", "New", "Dormant"];
const CHURN_LEVELS: (ChurnRisk | "ทั้งหมด")[] = ["ทั้งหมด", "High", "Medium", "Low"];

export default function Customers() {
  const navigate = useNavigate();
  const { customers, loading } = useData();
  const [search, setSearch] = useState("");
  const [segFilter, setSegFilter] = useState<Segment | "ทั้งหมด">("ทั้งหมด");
  const [spendFilter, setSpendFilter] = useState(0);
  const [churnFilter, setChurnFilter] = useState<ChurnRisk | "ทั้งหมด">("ทั้งหมด");
  const [segOpen, setSegOpen] = useState(false);
  const [spendOpen, setSpendOpen] = useState(false);
  const [churnOpen, setChurnOpen] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);

  const filtered = useMemo(() => customers.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.email.toLowerCase().includes(q);
    const matchSeg = segFilter === "ทั้งหมด" || c.segment === segFilter;
    const range = SPEND_RANGES[spendFilter];
    const matchSpend = c.totalSpend >= range.min && c.totalSpend < range.max;
    const matchChurn = churnFilter === "ทั้งหมด" || c.churnRisk === churnFilter;
    return matchSearch && matchSeg && matchSpend && matchChurn;
  }), [customers, search, segFilter, spendFilter, churnFilter]);

  const segmentCounts = (["Premium", "Regular", "New", "Dormant"] as Segment[]).map((s) => ({
    segment: s,
    count: customers.filter((c) => c.segment === s).length,
  }));

  if (loading) {
    return <main className="max-w-5xl mx-auto px-6 py-8"><p style={{ color: "var(--color-ink-3)" }}>กำลังโหลดข้อมูล...</p></main>;
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-8 space-y-5">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>Customers</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--color-ink-3)" }}>
          {customers.length.toLocaleString("th-TH")} รายชื่อ · แสดง {filtered.length} รายการ
        </p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {segmentCounts.map(({ segment: s, count }) => {
          const meta = SEGMENT_META[s];
          return (
            <button
              key={s}
              onClick={() => navigate(`/customers/segment/${s}`)}
              className="rounded-2xl p-4 text-left group transition-all duration-150"
              style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", cursor: "pointer", fontFamily: "var(--font-sans)" }}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: meta.bg, color: meta.color }}>{s}</span>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: "var(--color-ink-3)", flexShrink: 0, marginTop: 2 }}>
                  <path d="M3 7h8M8 3.5l3.5 3.5L8 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-2xl font-semibold tabular-nums" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>{count.toLocaleString("th-TH")}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>ลูกค้าในกลุ่ม</p>
            </button>
          );
        })}
      </div>

      <div className="flex gap-3 items-center">
        <div className="flex-1 relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" width="15" height="15" viewBox="0 0 15 15" fill="none">
            <circle cx="6.5" cy="6.5" r="5" stroke="var(--color-ink-3)" strokeWidth="1.5" />
            <path d="M10.5 10.5l3 3" stroke="var(--color-ink-3)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ, เบอร์โทร, อีเมล..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", color: "var(--color-ink)", fontFamily: "var(--font-sans)" }}
          />
        </div>

        <div className="relative">
          <button
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{ backgroundColor: segFilter !== "ทั้งหมด" ? "var(--color-ink)" : "var(--color-surface)", color: segFilter !== "ทั้งหมด" ? "#fff" : "var(--color-ink-2)", border: "1px solid var(--color-rule)", cursor: "pointer" }}
            onClick={() => { setSegOpen((o) => !o); setSpendOpen(false); setChurnOpen(false); }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 3h12M3 7h8M5 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            {segFilter === "ทั้งหมด" ? "Segment" : segFilter}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.6 }}><path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          {segOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-44 rounded-xl overflow-hidden z-20" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", boxShadow: "0 8px 24px rgba(0,0,0,0.1)" }}>
              {SEGMENTS.map((s) => (
                <button key={s} className="w-full text-left px-4 py-2.5 text-sm transition-colors" style={{ backgroundColor: segFilter === s ? "var(--color-ground)" : "transparent", color: "var(--color-ink)", cursor: "pointer", border: "none" }} onClick={() => { setSegFilter(s as Segment | "ทั้งหมด"); setSegOpen(false); }}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <button
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{ backgroundColor: spendFilter !== 0 ? "var(--color-ink)" : "var(--color-surface)", color: spendFilter !== 0 ? "#fff" : "var(--color-ink-2)", border: "1px solid var(--color-rule)", cursor: "pointer" }}
            onClick={() => { setSpendOpen((o) => !o); setSegOpen(false); setChurnOpen(false); }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" /><path d="M7 4.5v5M5 6.5h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            {spendFilter === 0 ? "ยอดซื้อ" : SPEND_RANGES[spendFilter].label}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.6 }}><path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          {spendOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-52 rounded-xl overflow-hidden z-20" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", boxShadow: "0 8px 24px rgba(0,0,0,0.1)" }}>
              {SPEND_RANGES.map((r, i) => (
                <button key={r.label} className="w-full text-left px-4 py-2.5 text-sm transition-colors" style={{ backgroundColor: spendFilter === i ? "var(--color-ground)" : "transparent", color: "var(--color-ink)", cursor: "pointer", border: "none" }} onClick={() => { setSpendFilter(i); setSpendOpen(false); }}>
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <button
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{ backgroundColor: churnFilter !== "ทั้งหมด" ? CHURN_META[churnFilter].bg : "var(--color-surface)", color: churnFilter !== "ทั้งหมด" ? CHURN_META[churnFilter].color : "var(--color-ink-2)", border: `1px solid ${churnFilter !== "ทั้งหมด" ? CHURN_META[churnFilter].bg : "var(--color-rule)"}`, cursor: "pointer" }}
            onClick={() => { setChurnOpen((o) => !o); setSegOpen(false); setSpendOpen(false); }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" /><path d="M7 4v3.5l2 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            {churnFilter === "ทั้งหมด" ? "Churn risk" : CHURN_META[churnFilter].label}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.6 }}><path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          {churnOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-44 rounded-xl overflow-hidden z-20" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", boxShadow: "0 8px 24px rgba(0,0,0,0.1)" }}>
              {CHURN_LEVELS.map((level) => (
                <button key={level} className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2.5 transition-colors" style={{ backgroundColor: churnFilter === level ? "var(--color-ground)" : "transparent", color: "var(--color-ink)", cursor: "pointer", border: "none" }} onClick={() => { setChurnFilter(level); setChurnOpen(false); }}>
                  {level !== "ทั้งหมด" && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: CHURN_META[level as ChurnRisk].color }} />}
                  {level === "ทั้งหมด" ? "ทั้งหมด" : CHURN_META[level as ChurnRisk].label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }} onClick={() => { setSegOpen(false); setSpendOpen(false); setChurnOpen(false); }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-rule)" }}>
              <th className="px-4 py-3 text-xs font-medium tracking-wide uppercase text-left" style={{ color: "var(--color-ink-3)" }}>ชื่อลูกค้า</th>
              <th className="px-3 py-3 text-xs font-medium tracking-wide uppercase text-left" style={{ color: "var(--color-ink-3)", width: 160 }}>ติดต่อ</th>
              <th className="px-3 py-3 text-xs font-medium tracking-wide uppercase text-left" style={{ color: "var(--color-ink-3)", width: 96 }}>Segment</th>
              <th className="px-3 py-3 text-xs font-medium tracking-wide uppercase text-left" style={{ color: "var(--color-ink-3)", width: 108 }}>Churn risk</th>
              <th className="px-3 py-3 text-xs font-medium tracking-wide uppercase text-left" style={{ color: "var(--color-ink-3)", width: 108 }}>ยอดซื้อสะสม</th>
              <th className="px-3 py-3 text-xs font-medium tracking-wide uppercase text-left whitespace-nowrap" style={{ color: "var(--color-ink-3)", width: 112 }}>ซื้อล่าสุด</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-sm" style={{ color: "var(--color-ink-3)" }}>ไม่พบรายชื่อที่ตรงกับเงื่อนไข</td></tr>
            ) : filtered.map((c, i) => {
              const seg = SEGMENT_META[c.segment];
              const churn = CHURN_META[c.churnRisk];
              return (
                <tr key={c.id} className="cursor-pointer" style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--color-rule)" : "none" }} onClick={() => setSelected(c)}>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold flex-shrink-0" style={{ backgroundColor: "var(--color-ink)", color: "#fff" }}>{c.avatar}</div>
                      <span className="font-medium" style={{ color: "var(--color-ink)" }}>{c.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3.5" style={{ maxWidth: 160 }}>
                    <div className="text-xs truncate" style={{ color: "var(--color-ink)" }}>{c.phone}</div>
                    <div className="text-xs truncate" style={{ color: "var(--color-ink-3)" }}>{c.email}</div>
                  </td>
                  <td className="px-3 py-3.5">
                    <button onClick={(e) => { e.stopPropagation(); navigate(`/customers/segment/${c.segment}`); }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                      <Badge label={c.segment} bg={seg.bg} color={seg.color} />
                    </button>
                  </td>
                  <td className="px-3 py-3.5">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: churn.bg, color: churn.color }}>
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: churn.color }} />
                      {churn.label.replace("ความเสี่ยง", "")}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 text-left font-semibold tabular-nums text-sm" style={{ color: "var(--color-ink)" }}>฿{c.totalSpend.toLocaleString("th-TH")}</td>
                  <td className="px-3 py-3.5 text-left text-xs whitespace-nowrap" style={{ color: "var(--color-ink-2)" }}>{c.lastPurchaseLabel}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && <CustomerDrawer customer={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}
