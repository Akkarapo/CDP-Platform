import { useMemo, useState } from "react";
import { useLocation } from "react-router";
import { useData } from "../lib/store";
import { buildProductStats, classifyRfmCell, RFM_MATRIX } from "../lib/analytics";
import type { Segment, ChurnRisk, CampaignRecord } from "../lib/types";
import { useAuth } from "../lib/auth";

type Target = Segment | "ทุก Segment";
const TARGETS: Target[] = ["Premium", "Regular", "New", "Dormant", "ทุก Segment"];

type ChurnFilter = ChurnRisk | "ทุกระดับ";
const CHURN_FILTERS: { value: ChurnFilter; label: string }[] = [
  { value: "ทุกระดับ", label: "ทุกระดับ" },
  { value: "High", label: "เสี่ยงสูง" },
  { value: "Medium", label: "เสี่ยงปานกลาง" },
  { value: "Low", label: "เสี่ยงต่ำ" },
];

type RfmFilter = string | "ทุกกลุ่ม";

const STATUS_META: Record<CampaignRecord["status"], { label: string; bg: string; color: string }> = {
  pending: { label: "รออนุมัติ", bg: "#FEF3C7", color: "#92400E" },
  approved: { label: "อนุมัติแล้ว", bg: "#E0E7FF", color: "#3730A3" },
  sent: { label: "ส่งแล้ว", bg: "#DCFCE7", color: "#166534" },
};

function LineChatPreview({ message }: { message: string }) {
  const lines = message.split("\n");
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--color-rule)" }}>
      <div className="flex items-center gap-2.5 px-4 py-3" style={{ backgroundColor: "#00B900" }}>
        <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 2C5.582 2 2 5.134 2 9c0 2.16 1.08 4.094 2.8 5.44-.11.48-.44 1.74-.5 2.02-.07.33.12.33.25.24.1-.07 1.62-1.07 2.28-1.51.36.05.73.08 1.17.08 4.418 0 8-3.134 8-7s-3.582-7-8-7z" fill="#00B900" /></svg>
        </div>
        <div>
          <p className="text-xs font-semibold text-white leading-none">CDP Brand Official</p>
          <p className="text-xs text-white mt-0.5" style={{ opacity: 0.75 }}>Official Account</p>
        </div>
      </div>
      <div className="px-4 py-5" style={{ backgroundColor: "#87CEEB22", minHeight: 160 }}>
        <div className="flex gap-2.5 items-end">
          <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center flex-shrink-0 shadow-sm" style={{ border: "1.5px solid #00B90040" }}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 2C5.582 2 2 5.134 2 9c0 2.16 1.08 4.094 2.8 5.44-.11.48-.44 1.74-.5 2.02-.07.33.12.33.25.24.1-.07 1.62-1.07 2.28-1.51.36.05.73.08 1.17.08 4.418 0 8-3.134 8-7s-3.582-7-8-7z" fill="#00B900" /></svg>
          </div>
          <div className="rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed max-w-xs" style={{ backgroundColor: "#ffffff", color: "#1A1917", boxShadow: "0 1px 4px rgba(0,0,0,0.1)", wordBreak: "break-word" }}>
            {lines.map((line, i) => <span key={i}>{line}{i < lines.length - 1 && <br />}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateTab({ preselected }: { preselected?: Segment }) {
  const { customers, rawTransactions, addCampaign } = useData();
  const [target, setTarget] = useState<Target | null>(preselected ?? null);
  const [churnFilter, setChurnFilter] = useState<ChurnFilter>("ทุกระดับ");
  const [rfmFilter, setRfmFilter] = useState<RfmFilter>("ทุกกลุ่ม");
  const [prompt, setPrompt] = useState("");
  const [generated, setGenerated] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const effectiveTarget = target ?? "ทุก Segment";

  const countFor = (seg: Target, churn: ChurnFilter, rfm: RfmFilter) => customers.filter((c) => {
    const matchesSegment = seg === "ทุก Segment" || c.segment === seg;
    const matchesChurn = churn === "ทุกระดับ" || c.churnRisk === churn;
    const matchesRfm = rfm === "ทุกกลุ่ม" || classifyRfmCell(c.rfm.recency, c.rfm.frequency, c.rfm.monetary).key === rfm;
    return matchesSegment && matchesChurn && matchesRfm;
  }).length;

  const audience = useMemo(() => customers.filter((c) => {
    const matchesSegment = !target || target === "ทุก Segment" || c.segment === target;
    const matchesChurn = churnFilter === "ทุกระดับ" || c.churnRisk === churnFilter;
    const matchesRfm = rfmFilter === "ทุกกลุ่ม" || classifyRfmCell(c.rfm.recency, c.rfm.frequency, c.rfm.monetary).key === rfmFilter;
    return matchesSegment && matchesChurn && matchesRfm;
  }), [customers, target, churnFilter, rfmFilter]);

  const suggestedProducts = useMemo(() => {
    const memberIds = new Set(audience.map((c) => c.id));
    const audienceTx = rawTransactions.filter((t) => memberIds.has(t.customer_id));
    return buildProductStats(audienceTx).topProducts.slice(0, 3).map((p) => p.name);
  }, [audience, rawTransactions]);

  const targetCount = audience.length;
  const churnLabel = CHURN_FILTERS.find((f) => f.value === churnFilter)?.label ?? "ทุกระดับ";
  const rfmCell = rfmFilter === "ทุกกลุ่ม" ? null : RFM_MATRIX.find((c) => c.key === rfmFilter) ?? null;
  const rfmLabel = rfmCell?.label ?? "ทุกกลุ่ม RFM";

  const handleGenerate = async () => {
    if (!prompt.trim() || !target) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          segmentLabel: target,
          churnLabel,
          rfmCellLabel: rfmLabel,
          rfmCellDescription: rfmCell?.description ?? "",
          customerCount: targetCount,
          topProducts: suggestedProducts,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "สร้างข้อความไม่สำเร็จ กรุณาลองใหม่");
      setGenerated(data.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!target || !generated) return;
    setSubmitError(null);
    try {
      await addCampaign({
        name: prompt.slice(0, 40) || `แคมเปญสำหรับ ${target}`,
        targetSegment: target,
        status: "pending",
        message: generated,
        prompt: prompt.trim(),
        churnFilterLabel: churnFilter === "ทุกระดับ" ? undefined : churnLabel,
        rfmFilterLabel: rfmFilter === "ทุกกลุ่ม" ? undefined : rfmLabel,
      });
      setSubmitted(true);
    } catch (submitErr) {
      setSubmitError(submitErr instanceof Error ? submitErr.message : "บันทึกแคมเปญไม่สำเร็จ");
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: "#E0E7FF" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="#3730A3" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <div className="text-center">
          <p className="text-base font-semibold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>บันทึกแคมเปญแล้ว</p>
          <p className="text-sm mt-1" style={{ color: "var(--color-ink-3)" }}>ดูสถานะและอัปเดตได้ที่แท็บ "ประวัติแคมเปญ"</p>
        </div>
        <button onClick={() => { setSubmitted(false); setTarget(null); setChurnFilter("ทุกระดับ"); setRfmFilter("ทุกกลุ่ม"); setPrompt(""); setGenerated(""); setError(null); }} className="mt-2 px-5 py-2 rounded-xl text-sm font-medium" style={{ backgroundColor: "var(--color-ink)", color: "#fff", border: "none", cursor: "pointer" }}>
          สร้างแคมเปญใหม่
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8 items-start">
    <div className="space-y-6 max-w-2xl">
      <section>
        <p className="text-sm font-semibold mb-1" style={{ color: "var(--color-ink)" }}>
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs mr-2 font-bold" style={{ backgroundColor: "var(--color-ink)", color: "#fff" }}>1</span>
          เลือกกลุ่มเป้าหมาย
        </p>
        <p className="text-xs mb-3 ml-7" style={{ color: "var(--color-ink-3)" }}>จำนวนลูกค้าคำนวณจากข้อมูลจริงในไฟล์ CSV — เลือกได้หลายมิติร่วมกัน (ตัวเลือกที่ทำให้ไม่มีลูกค้าเหลือจะถูกปิดไว้)</p>

        <div className="ml-7 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--color-ink-3)" }}>Segment</p>
            <div className="grid grid-cols-3 gap-2">
              {TARGETS.map((t) => {
                const active = target === t;
                const count = countFor(t, churnFilter, rfmFilter);
                const disabled = count === 0 && t !== "ทุก Segment";
                return (
                  <button key={t} onClick={() => !disabled && setTarget(t)} disabled={disabled} className="text-left rounded-xl px-3 py-2.5" style={{ backgroundColor: active ? "var(--color-ink)" : "var(--color-surface)", border: `1.5px solid ${active ? "var(--color-ink)" : "var(--color-rule)"}`, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1 }}>
                    <p className="text-xs font-semibold" style={{ color: active ? "#fff" : "var(--color-ink)" }}>{t}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--color-ink-3)" }}>Churn Risk</p>
            <div className="grid grid-cols-4 gap-2">
              {CHURN_FILTERS.map(({ value, label }) => {
                const active = churnFilter === value;
                const count = countFor(effectiveTarget, value, rfmFilter);
                const disabled = count === 0 && value !== "ทุกระดับ";
                return (
                  <button key={value} onClick={() => !disabled && setChurnFilter(value)} disabled={disabled} className="text-left rounded-xl px-3 py-2.5" style={{ backgroundColor: active ? "var(--color-ink)" : "var(--color-surface)", border: `1.5px solid ${active ? "var(--color-ink)" : "var(--color-rule)"}`, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1 }}>
                    <p className="text-xs font-semibold" style={{ color: active ? "#fff" : "var(--color-ink)" }}>{label}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--color-ink-3)" }}>กลุ่ม RFM</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setRfmFilter("ทุกกลุ่ม")} className="text-left rounded-xl px-3 py-2.5" style={{ backgroundColor: rfmFilter === "ทุกกลุ่ม" ? "var(--color-ink)" : "var(--color-surface)", border: `1.5px solid ${rfmFilter === "ทุกกลุ่ม" ? "var(--color-ink)" : "var(--color-rule)"}`, cursor: "pointer" }}>
                <p className="text-xs font-semibold" style={{ color: rfmFilter === "ทุกกลุ่ม" ? "#fff" : "var(--color-ink)" }}>ทุกกลุ่ม RFM</p>
              </button>
              {RFM_MATRIX.map((cell) => {
                const active = rfmFilter === cell.key;
                const count = countFor(effectiveTarget, churnFilter, cell.key);
                const disabled = count === 0;
                return (
                  <button key={cell.key} onClick={() => !disabled && setRfmFilter(cell.key)} disabled={disabled} title={cell.description} className="text-left rounded-xl px-3 py-2.5" style={{ backgroundColor: active ? "var(--color-ink)" : "var(--color-surface)", border: `1.5px solid ${active ? "var(--color-ink)" : "var(--color-rule)"}`, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1 }}>
                    <p className="text-xs font-semibold" style={{ color: active ? "#fff" : "var(--color-ink)" }}>{cell.label}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section>
        <p className="text-sm font-semibold mb-1" style={{ color: "var(--color-ink)" }}>
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs mr-2 font-bold" style={{ backgroundColor: "var(--color-ink)", color: "#fff" }}>2</span>
          Prompt สำหรับ AI
        </p>
        <p className="text-xs mb-3 ml-7" style={{ color: "var(--color-ink-3)" }}>บอกโจทย์แคมเปญที่ต้องการ AI จะคิดข้อความให้ตามกลุ่มเป้าหมาย (Segment / Churn / RFM) และสินค้าขายดีจริงของกลุ่มนี้</p>
        <div className="ml-7 space-y-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="เช่น: อยากดึงลูกค้ากลุ่มนี้กลับมาซื้อซ้ำ โดยเน้นสินค้าที่เขาเคยซื้อ ไม่ต้องลดราคาแรง"
            rows={3}
            className="w-full rounded-xl px-4 py-3 text-sm resize-none outline-none"
            style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", color: "var(--color-ink)", lineHeight: 1.6 }}
          />
          {target && suggestedProducts.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)" }}>
              <div className="flex-1 min-w-0">
                <p className="text-xs mb-1" style={{ color: "var(--color-ink-3)" }}>สินค้าขายดีจริงของกลุ่มนี้ (จะส่งให้ AI อ้างอิง): {suggestedProducts.join(", ")}</p>
              </div>
            </div>
          )}
          {error && (
            <p role="alert" className="text-xs leading-relaxed rounded-xl px-3.5 py-3" style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}>{error}</p>
          )}
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || !target || loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
            style={{ backgroundColor: !prompt.trim() || !target || loading ? "var(--color-ground)" : "var(--color-ink)", color: !prompt.trim() || !target || loading ? "var(--color-ink-3)" : "#fff", border: "none", cursor: !prompt.trim() || !target || loading ? "not-allowed" : "pointer" }}
          >
            {loading ? "กำลังสร้างด้วย AI…" : "สร้างแคมเปญด้วย AI"}
          </button>
        </div>
      </section>

      <section>
        <p className="text-sm font-semibold mb-1" style={{ color: "var(--color-ink)" }}>
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs mr-2 font-bold" style={{ backgroundColor: "var(--color-ink)", color: "#fff" }}>3</span>
          พรีวิวข้อความ
        </p>
        <div className="ml-7">
          {generated ? <LineChatPreview message={generated} /> : (
            <div className="rounded-2xl flex items-center justify-center py-12" style={{ border: "1.5px dashed var(--color-rule)" }}>
              <p className="text-sm" style={{ color: "var(--color-ink-3)" }}>{target ? "กด \"สร้างแคมเปญด้วย AI\"" : "เลือกกลุ่มเป้าหมายก่อน"}</p>
            </div>
          )}
        </div>
      </section>

      <div className="ml-7 pb-4">
        {submitError && <p role="alert" className="text-xs mb-2" style={{ color: "#991B1B" }}>{submitError}</p>}
        <button onClick={handleSubmit} disabled={!generated} className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-sm font-semibold" style={{ backgroundColor: generated ? "var(--color-ink)" : "var(--color-ground)", color: generated ? "#fff" : "var(--color-ink-3)", border: "none", cursor: generated ? "pointer" : "not-allowed" }}>
          บันทึกแคมเปญ
        </button>
      </div>
    </div>

    <aside className="lg:sticky lg:top-8">
      <div className="rounded-2xl p-5" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--color-ink-3)" }}>ลูกค้าที่ตรงเงื่อนไขทั้งหมด</p>
        <p className="text-4xl font-semibold tabular-nums mb-4" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>{targetCount.toLocaleString("th-TH")} <span className="text-base font-normal" style={{ color: "var(--color-ink-3)" }}>คน</span></p>
        <div className="space-y-2 pt-4" style={{ borderTop: "1px solid var(--color-rule)" }}>
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: "var(--color-ink-3)" }}>Segment</span>
            <span className="font-medium" style={{ color: "var(--color-ink)" }}>{effectiveTarget}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: "var(--color-ink-3)" }}>Churn Risk</span>
            <span className="font-medium" style={{ color: "var(--color-ink)" }}>{churnLabel}</span>
          </div>
          <div className="flex items-center justify-between text-xs gap-2">
            <span style={{ color: "var(--color-ink-3)" }}>กลุ่ม RFM</span>
            <span className="font-medium text-right" style={{ color: "var(--color-ink)" }}>{rfmLabel}</span>
          </div>
        </div>
        {suggestedProducts.length > 0 && (
          <div className="pt-4 mt-4" style={{ borderTop: "1px solid var(--color-rule)" }}>
            <p className="text-xs mb-1.5" style={{ color: "var(--color-ink-3)" }}>สินค้าขายดีจริงของกลุ่มนี้</p>
            <p className="text-xs leading-relaxed" style={{ color: "var(--color-ink)" }}>{suggestedProducts.join(", ")}</p>
          </div>
        )}
      </div>
    </aside>
    </div>
  );
}

function HistoryTab({ canEdit }: { canEdit: boolean }) {
  const { campaigns, updateCampaignStatus } = useData();
  if (campaigns.length === 0) {
    return <p className="text-sm" style={{ color: "var(--color-ink-3)" }}>ยังไม่มีแคมเปญ — สร้างได้จากแท็บ "สร้างแคมเปญ"</p>;
  }
  return (
    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--color-rule)" }}>
            <th className="px-4 py-3 text-xs font-medium tracking-wide uppercase text-left" style={{ color: "var(--color-ink-3)" }}>ชื่อแคมเปญ</th>
            <th className="px-3 py-3 text-xs font-medium tracking-wide uppercase text-left" style={{ color: "var(--color-ink-3)" }}>กลุ่ม</th>
            <th className="px-3 py-3 text-xs font-medium tracking-wide uppercase text-left" style={{ color: "var(--color-ink-3)" }}>สถานะ</th>
            <th className="px-3 py-3 text-xs font-medium tracking-wide uppercase text-left" style={{ color: "var(--color-ink-3)" }}>สร้างเมื่อ</th>
            <th className="px-3 py-3 text-xs font-medium tracking-wide uppercase text-right" style={{ color: "var(--color-ink-3)" }}>จัดการ</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c, i) => {
            const s = STATUS_META[c.status];
            return (
              <tr key={c.id} style={{ borderBottom: i < campaigns.length - 1 ? "1px solid var(--color-rule)" : "none" }}>
                <td className="px-4 py-3.5 font-medium" style={{ color: "var(--color-ink)" }}>{c.name}</td>
                <td className="px-3 py-3.5 text-xs" style={{ color: "var(--color-ink-2)" }}>
                  {c.targetSegment}
                  {(c.churnFilterLabel || c.rfmFilterLabel) && (
                    <span style={{ color: "var(--color-ink-3)" }}> · {[c.churnFilterLabel, c.rfmFilterLabel].filter(Boolean).join(" · ")}</span>
                  )}
                </td>
                <td className="px-3 py-3.5">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: s.bg, color: s.color }}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />{s.label}
                  </span>
                </td>
                <td className="px-3 py-3.5 text-xs" style={{ color: "var(--color-ink-2)" }}>{new Date(c.createdAt).toLocaleDateString("th-TH-u-ca-gregory")}</td>
                <td className="px-3 py-3.5 text-right">
                  {canEdit && c.status === "pending" && (
                    <button onClick={() => void updateCampaignStatus(c.id, "approved")} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)", color: "var(--color-ink-2)", cursor: "pointer" }}>อนุมัติ</button>
                  )}
                  {canEdit && c.status === "approved" && (
                    <button onClick={() => void updateCampaignStatus(c.id, "sent")} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: "var(--color-ink)", color: "#fff", border: "none", cursor: "pointer" }}>ทำเครื่องหมายว่าส่งแล้ว</button>
                  )}
                  {!canEdit && <span className="text-xs" style={{ color: "var(--color-ink-3)" }}>ดูอย่างเดียว</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Campaigns() {
  const { canEditCampaigns } = useAuth();
  const location = useLocation();
  const preselectedSegment = (location.state as any)?.preselectedSegment as Segment | undefined;
  const [tab, setTab] = useState<"create" | "history">(canEditCampaigns ? "create" : "history");

  return (
    <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>Campaigns</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--color-ink-3)" }}>สร้างและจัดการแคมเปญการตลาดจากข้อมูลลูกค้าจริง</p>
      </div>

      <div className="flex gap-1" style={{ borderBottom: "1px solid var(--color-rule)" }}>
        {[
          ...(canEditCampaigns ? [{ id: "create", label: "สร้างแคมเปญ" }] : []),
          { id: "history", label: "ประวัติแคมเปญ" },
        ].map((t) => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id as "create" | "history")} className="px-4 py-2.5 text-sm font-medium relative" style={{ color: active ? "var(--color-ink)" : "var(--color-ink-3)", background: "none", border: "none", cursor: "pointer", marginBottom: -1 }}>
              {t.label}
              {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ backgroundColor: "var(--color-ink)" }} />}
            </button>
          );
        })}
      </div>

      {tab === "create" && canEditCampaigns && <CreateTab preselected={preselectedSegment} />}
      {tab === "history" && <HistoryTab canEdit={canEditCampaigns} />}
    </main>
  );
}
