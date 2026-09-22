import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { useData } from "../lib/store";
import { buildProductStats } from "../lib/analytics";
import type { Customer, Segment, ChurnRisk } from "../lib/types";
import { useAuth } from "../lib/auth";

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

// Authored playbook copy per segment — this is business strategy text, not
// something derivable from the CSVs, so it stays as static content.
const STRATEGY: Record<Segment, { text: string; promos: string[] }> = {
  Premium: {
    text: "กลุ่ม Premium มี Lifetime Value สูงและตอบสนองต่อ Exclusive Experience ดี ควรเน้น Early Access, Personalization และโปรแกรม Loyalty ระดับบน เพื่อรักษาความสัมพันธ์ระยะยาวและกระตุ้น upsell",
    promos: ["Early Access สินค้าใหม่ก่อนใคร 48 ชั่วโมง", "ส่วนลดพิเศษสำหรับ VIP Members", "ของขวัญพิเศษวันเกิด", "Double Points เดือนนี้"],
  },
  Regular: {
    text: "กลุ่ม Regular มีความถี่ซื้อสม่ำเสมอแต่ยังมีศักยภาพ Upsell สู่ Premium ควรใช้ Bundle Deal และ Loyalty Point เพื่อเพิ่ม Basket Size และนำเสนอ Upgrade Path ที่ชัดเจน",
    promos: ["Bundle 2 ชิ้น ลด 10%", "สะสมแต้ม แลกรับส่วนลด", "Upgrade สู่ Premium รับโบนัสแต้ม", "Flash Sale รายสัปดาห์"],
  },
  New: {
    text: "กลุ่ม New มี Conversion Potential สูงในช่วง 30 วันแรก ควรส่ง Onboarding Series อย่างรวดเร็ว นำเสนอ First-Purchase Reward และ Discovery Content เพื่อสร้างนิสัยการซื้อซ้ำ",
    promos: ["Welcome Coupon สำหรับออเดอร์แรก", "ส่งฟรีออเดอร์แรก", "สมัครสมาชิก รับแต้มทันที", "ชุดทดลองราคาพิเศษ"],
  },
  Dormant: {
    text: "กลุ่ม Dormant มีความเสี่ยง Churn สูง ต้องการ Win-Back Campaign ที่มี Incentive ชัดเจน เช่น ส่วนลดพิเศษหรือของสมนาคุณ ควรทำความถี่ต่ำ (1-2 ครั้งต่อเดือน) เพื่อไม่สร้าง Negative Impression",
    promos: ["Win-Back Coupon ส่วนลดพิเศษ", "ไม่ได้เจอกันนาน รับของสมนาคุณ", "กลับมาซื้อ รับ Gift Box", "Last Chance Offer"],
  },
};

function MiniDrawer({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const seg = SEGMENT_META[customer.segment];
  const churn = CHURN_META[customer.churnRisk];
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(26,25,23,0.35)", backdropFilter: "blur(2px)" }} onClick={onClose} />
      <div className="relative w-full max-w-sm flex flex-col overflow-hidden" style={{ backgroundColor: "var(--color-surface)", borderLeft: "1px solid var(--color-rule)", boxShadow: "-8px 0 32px rgba(0,0,0,0.12)" }}>
        <div className="flex items-start justify-between px-6 pt-6 pb-5" style={{ borderBottom: "1px solid var(--color-rule)" }}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-semibold flex-shrink-0" style={{ backgroundColor: "var(--color-ink)", color: "#fff" }}>{customer.avatar}</div>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>{customer.name}</h3>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>{customer.phone}</p>
              <div className="flex gap-1.5 mt-1.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: seg.bg, color: seg.color }}>{customer.segment}</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: churn.bg, color: churn.color }}>{churn.label}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-ink-3)" }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl p-3.5" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)" }}>
              <p className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--color-ink-3)" }}>ยอดซื้อสะสม</p>
              <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>฿{customer.totalSpend.toLocaleString("th-TH")}</p>
            </div>
            <div className="rounded-xl p-3.5" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)" }}>
              <p className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--color-ink-3)" }}>แต้มสะสม</p>
              <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>{customer.pointsBalance.toLocaleString("th-TH")}</p>
            </div>
            <div className="rounded-xl p-3.5" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)" }}>
              <p className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--color-ink-3)" }}>ซื้อล่าสุด</p>
              <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>{customer.lastPurchaseLabel}</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--color-ink-3)" }}>RFM Score</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { v: customer.rfm.recency, l: "Recency", real: `${customer.recencyDays.toLocaleString("th-TH")} วันก่อน` },
                { v: customer.rfm.frequency, l: "Frequency", real: `${customer.orderCount.toLocaleString("th-TH")} ครั้ง` },
                { v: customer.rfm.monetary, l: "Monetary", real: `฿${customer.totalSpend.toLocaleString("th-TH")}` },
              ].map(({ v, l, real }) => (
                <div key={l} className="rounded-xl p-3.5" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)" }}>
                  <p className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--color-ink-3)" }}>{l}</p>
                  <p className="text-base font-semibold tabular-nums leading-tight whitespace-nowrap" style={{ color: "var(--color-ink)" }}>{real}</p>
                  <p className="text-xs mt-1" style={{ color: "var(--color-ink-3)" }}>Point {v}/10</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SegmentProfile() {
  const { canEditCampaigns } = useAuth();
  const { segment } = useParams<{ segment: string }>();
  const navigate = useNavigate();
  const { customers, rawTransactions, loading } = useData();
  const [drawerCustomer, setDrawerCustomer] = useState<Customer | null>(null);

  const seg = segment as Segment;
  const meta = SEGMENT_META[seg];
  const playbook = STRATEGY[seg];
  const members = useMemo(() => customers.filter((c) => c.segment === seg), [customers, seg]);

  const segStats = useMemo(() => {
    const memberIds = new Set(members.map((c) => c.id));
    const segTx = rawTransactions.filter((t) => memberIds.has(t.customer_id));
    return buildProductStats(segTx);
  }, [members, rawTransactions]);

  if (loading) {
    return <main className="max-w-5xl mx-auto px-6 py-8"><p style={{ color: "var(--color-ink-3)" }}>กำลังโหลดข้อมูล...</p></main>;
  }
  if (!meta || !playbook) {
    return <main className="max-w-5xl mx-auto px-6 py-8"><p style={{ color: "var(--color-ink-3)" }}>ไม่พบข้อมูลกลุ่มนี้</p></main>;
  }

  const totalRevenue = members.reduce((s, c) => s + c.totalSpend, 0);
  const totalOrders = members.reduce((s, c) => s + c.orderCount, 0);
  const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const pctOfAll = customers.length ? ((members.length / customers.length) * 100).toFixed(1) : "0";

  const churnDist = (["Low", "Medium", "High"] as ChurnRisk[]).map((level) => ({
    label: CHURN_META[level].label,
    color: CHURN_META[level].color,
    pct: members.length ? Math.round((members.filter((c) => c.churnRisk === level).length / members.length) * 100) : 0,
  }));

  const handleCreateCampaign = () => navigate("/campaigns", { state: { preselectedSegment: seg } });

  return (
    <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center gap-2 text-xs" style={{ color: "var(--color-ink-3)" }}>
        <button onClick={() => navigate("/customers")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-ink-3)", padding: 0 }}>Customers</button>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3.5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span style={{ color: "var(--color-ink)" }}>{seg}</span>
      </div>

      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center px-3.5 py-1.5 rounded-full text-sm font-semibold" style={{ backgroundColor: meta.bg, color: meta.color }}>{seg}</span>
            <h1 className="text-2xl font-semibold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>{seg} Segment</h1>
          </div>
          {canEditCampaigns && <button onClick={handleCreateCampaign} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium" style={{ backgroundColor: "var(--color-ink)", color: "#fff", border: "none", cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            สร้างแคมเปญสำหรับกลุ่มนี้
          </button>}
        </div>

        <div className="rounded-2xl p-4" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)" }}>
          <p className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--color-ink-3)" }}>จำนวนลูกค้าในกลุ่ม</p>
          <p className="text-3xl font-semibold tabular-nums" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>{members.length.toLocaleString("th-TH")}</p>
          <p className="text-sm mt-1" style={{ color: "var(--color-ink-3)" }}>คิดเป็น <span className="font-semibold" style={{ color: "var(--color-ink)" }}>{pctOfAll}%</span> ของลูกค้าทั้งหมด</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl p-5 space-y-4" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)" }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-3)" }}>Commerce</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "AOV", value: `฿${aov.toLocaleString("th-TH", { maximumFractionDigits: 0 })}`, sub: "เฉลี่ย/ออเดอร์" },
              { label: "จำนวนออเดอร์", value: totalOrders.toLocaleString("th-TH"), sub: "รวมกลุ่ม" },
              { label: "Revenue", value: `฿${totalRevenue.toLocaleString("th-TH")}`, sub: "รวมกลุ่ม" },
            ].map(({ label, value, sub }) => (
              <div key={label} className="rounded-xl p-3.5" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)" }}>
                <p className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--color-ink-3)" }}>{label}</p>
                <p className="text-lg font-semibold tabular-nums leading-tight" style={{ color: "var(--color-ink)" }}>{value}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>{sub}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl p-5 space-y-4" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)" }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-3)" }}>การกระจายความเสี่ยง Churn (ปัจจุบัน)</p>
          <div className="flex w-full h-8 rounded-xl overflow-hidden" style={{ gap: 2 }}>
            {churnDist.map((c) => (
              <div key={c.label} style={{ width: `${c.pct}%`, backgroundColor: c.color }} title={`${c.label}: ${c.pct}%`} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {churnDist.map((c) => (
              <span key={c.label} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-ink-3)" }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />{c.label}: {c.pct}%
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl p-5" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)" }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-4" style={{ color: "var(--color-ink-3)" }}>สินค้ายอดนิยมในกลุ่มนี้</p>
          {segStats.topProducts.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--color-ink-3)" }}>ยังไม่มีข้อมูล</p>
          ) : (
            <div className="space-y-2.5">
              {segStats.topProducts.slice(0, 5).map((p, i, arr) => {
                const maxSold = Math.max(...arr.map((x) => x.sold));
                const barW = maxSold ? Math.round((p.sold / maxSold) * 100) : 0;
                return (
                  <div key={p.name} className="flex items-center gap-3">
                    <span className="text-xs font-semibold w-4 shrink-0 tabular-nums" style={{ color: "var(--color-ink-3)" }}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium truncate" style={{ color: "var(--color-ink)" }}>{p.name}</span>
                        <span className="text-xs tabular-nums ml-2 shrink-0" style={{ color: "var(--color-ink-3)" }}>{p.sold.toLocaleString("th-TH")} ชิ้น</span>
                      </div>
                      <div className="h-1.5 rounded-full" style={{ backgroundColor: "var(--color-rule)" }}>
                        <div className="h-1.5 rounded-full" style={{ width: `${barW}%`, backgroundColor: "var(--color-ink)" }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl p-5" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)" }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-4" style={{ color: "var(--color-ink-3)" }}>คู่สินค้าที่ซื้อร่วมกันบ่อยในกลุ่มนี้</p>
          {segStats.pairs.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--color-ink-3)" }}>ยังไม่มีข้อมูลเพียงพอ</p>
          ) : (
            <div className="space-y-3">
              {segStats.pairs.slice(0, 3).map((p, i) => (
                <div key={i} className="rounded-xl p-3.5" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", color: "var(--color-ink)" }}>{p.a}</span>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7h8M8 4l3 3-3 3" stroke="var(--color-ink-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", color: "var(--color-ink)" }}>{p.b}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: "var(--color-rule)" }}>
                      <div className="h-1.5 rounded-full" style={{ width: `${p.pct}%`, backgroundColor: "var(--color-ink)" }} />
                    </div>
                    <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--color-ink-3)" }}>{p.pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl p-5" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)" }}>
        <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--color-ink-3)" }}>กลยุทธ์ที่แนะนำ</p>
        <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--color-ink)" }}>{playbook.text}</p>
        <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--color-ink-3)" }}>โปรโมชันที่เหมาะกับกลุ่มนี้</p>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {playbook.promos.map((promo, i) => (
            <div key={i} className="flex items-start gap-2.5 rounded-xl px-4 py-3" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)" }}>
              <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: "var(--color-ink)" }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2 2.5 5-4.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <p className="text-xs leading-snug" style={{ color: "var(--color-ink)" }}>{promo}</p>
            </div>
          ))}
        </div>
        {canEditCampaigns && <button onClick={handleCreateCampaign} className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium w-full justify-center" style={{ backgroundColor: "var(--color-ink)", color: "#fff", border: "none", cursor: "pointer" }}>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M7.5 1v13M1 7.5h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          สร้างแคมเปญสำหรับกลุ่มนี้
        </button>}
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--color-ink-3)" }}>ลูกค้าในกลุ่มนี้ ({members.length})</p>
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-rule)" }}>
                {["ชื่อลูกค้า", "ติดต่อ", "ยอดซื้อสะสม", "ซื้อล่าสุด", "Churn Risk"].map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-medium tracking-wide uppercase text-left" style={{ color: "var(--color-ink-3)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((c, i) => {
                const churn = CHURN_META[c.churnRisk];
                return (
                  <tr key={c.id} className="cursor-pointer" style={{ borderBottom: i < members.length - 1 ? "1px solid var(--color-rule)" : "none" }} onClick={() => setDrawerCustomer(c)}>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold shrink-0" style={{ backgroundColor: "var(--color-ink)", color: "#fff" }}>{c.avatar}</div>
                        <span className="font-medium" style={{ color: "var(--color-ink)" }}>{c.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-xs" style={{ color: "var(--color-ink)" }}>{c.phone}</div>
                      <div className="text-xs" style={{ color: "var(--color-ink-3)" }}>{c.email}</div>
                    </td>
                    <td className="px-4 py-3.5 font-semibold tabular-nums text-sm" style={{ color: "var(--color-ink)" }}>฿{c.totalSpend.toLocaleString("th-TH")}</td>
                    <td className="px-4 py-3.5 text-xs whitespace-nowrap" style={{ color: "var(--color-ink-2)" }}>{c.lastPurchaseLabel}</td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: churn.bg, color: churn.color }}>
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: churn.color }} />{churn.label.replace("ความเสี่ยง", "")}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {drawerCustomer && <MiniDrawer customer={drawerCustomer} onClose={() => setDrawerCustomer(null)} />}
    </main>
  );
}
