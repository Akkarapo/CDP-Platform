import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router";
import { useData } from "../lib/store";
import { supabase } from "../lib/supabase";
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

const TONES = ["อบอุ่นเป็นกันเอง", "สนุกสนาน", "ทางการ", "หรูหรา"];

const STATUS_META: Record<CampaignRecord["status"], { label: string; bg: string; color: string }> = {
  pending: { label: "รออนุมัติ", bg: "#FEF3C7", color: "#92400E" },
  rejected: { label: "ไม่อนุมัติ", bg: "#FEE2E2", color: "#991B1B" },
  approved: { label: "อนุมัติแล้ว", bg: "#E0E7FF", color: "#3730A3" },
  cancelled: { label: "ยกเลิกแล้ว", bg: "#FEE2E2", color: "#991B1B" },
  sent: { label: "ส่งแล้ว", bg: "#DCFCE7", color: "#166534" },
};
const PAUSED_META = { label: "หยุดชั่วคราว", bg: "#F3F4F6", color: "#6B7280" };

function LineChatPreview({ message, imageUrl }: { message: string; imageUrl?: string }) {
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
      <div className="px-4 py-5 space-y-2" style={{ backgroundColor: "#87CEEB22", minHeight: 160 }}>
        {imageUrl && (
          <div className="flex gap-2.5 items-end">
            <div className="w-8 h-8 flex-shrink-0" />
            <img src={imageUrl} alt="" className="rounded-2xl max-w-xs max-h-48 object-cover" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }} />
          </div>
        )}
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
  const [tone, setTone] = useState<string>(TONES[0]);
  const [generated, setGenerated] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [campaignId, setCampaignId] = useState(() => crypto.randomUUID());
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

  // Shown to the marketer purely as decision-support — real past sales for
  // this audience. Not sent to the AI and never used to gate what it can
  // write about: a campaign may be for a brand-new product never sold
  // before, or a service (tutoring, a concert) that isn't a "product" at
  // all, so nothing here should block the AI from writing about it.
  const audienceProducts = useMemo(() => {
    const memberIds = new Set(audience.map((c) => c.id));
    const audienceTx = rawTransactions.filter((t) => memberIds.has(t.customer_id));
    return buildProductStats(audienceTx).topProducts.slice(0, 5).map((p) => p.name);
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
          toneLabel: tone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "สร้างข้อความไม่สำเร็จ กรุณาลองใหม่");
      const trackingLink = `${window.location.origin}/api/track?c=${campaignId}`;
      setGenerated(`${data.message}\n\n${trackingLink}`);
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
        id: campaignId,
        name: prompt.slice(0, 40) || `แคมเปญสำหรับ ${target}`,
        targetSegment: target,
        status: "pending",
        message: generated,
        prompt: prompt.trim(),
        churnFilterLabel: churnFilter === "ทุกระดับ" ? undefined : churnLabel,
        rfmFilterLabel: rfmFilter === "ทุกกลุ่ม" ? undefined : rfmLabel,
        imageUrl: imageUrl.trim() || undefined,
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
        <button onClick={() => { setSubmitted(false); setTarget(null); setChurnFilter("ทุกระดับ"); setRfmFilter("ทุกกลุ่ม"); setPrompt(""); setTone(TONES[0]); setGenerated(""); setImageUrl(""); setCampaignId(crypto.randomUUID()); setError(null); }} className="mt-2 px-5 py-2 rounded-xl text-sm font-medium" style={{ backgroundColor: "var(--color-ink)", color: "#fff", border: "none", cursor: "pointer" }}>
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
        <p className="text-xs mb-3 ml-7" style={{ color: "var(--color-ink-3)" }}>บอกโจทย์แคมเปญที่ต้องการ AI จะคิดข้อความให้ตามกลุ่มเป้าหมาย (Segment / Churn / RFM) — AI จะพูดถึงเฉพาะสินค้าหรือบริการที่พิมพ์ไว้ในโจทย์นี้เท่านั้น (รองรับสินค้าใหม่หรือบริการที่ไม่มีในประวัติการขายด้วย)</p>
        <div className="ml-7 space-y-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="เช่น: อยากดึงลูกค้ากลุ่มนี้กลับมาซื้อซ้ำ โดยเน้นสินค้าที่เขาเคยซื้อ ไม่ต้องลดราคาแรง"
            rows={3}
            className="w-full rounded-xl px-4 py-3 text-sm resize-none outline-none"
            style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", color: "var(--color-ink)", lineHeight: 1.6 }}
          />
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--color-ink-2)" }}>โทนของข้อความ</label>
            <div className="grid grid-cols-4 gap-2">
              {TONES.map((t) => {
                const active = tone === t;
                return (
                  <button key={t} onClick={() => setTone(t)} className="text-left rounded-xl px-3 py-2" style={{ backgroundColor: active ? "var(--color-ink)" : "var(--color-surface)", border: `1.5px solid ${active ? "var(--color-ink)" : "var(--color-rule)"}`, cursor: "pointer" }}>
                    <p className="text-xs font-semibold" style={{ color: active ? "#fff" : "var(--color-ink)" }}>{t}</p>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: "var(--color-ink-2)" }}>รูปภาพประกอบ (ลิงก์ URL, ไม่บังคับ)</label>
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…jpg หรือ .png"
              className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
              style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", color: "var(--color-ink)", fontFamily: "monospace" }}
            />
          </div>
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
          {generated ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--color-ink-2)" }}>แก้ไขข้อความก่อนบันทึก (มีลิงก์ติดตามแทรกให้อัตโนมัติแล้ว)</label>
                <textarea
                  value={generated}
                  onChange={(e) => setGenerated(e.target.value)}
                  rows={6}
                  className="w-full rounded-xl px-4 py-3 text-sm resize-none outline-none"
                  style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", color: "var(--color-ink)", lineHeight: 1.6 }}
                />
              </div>
              <LineChatPreview message={generated} imageUrl={imageUrl.trim() || undefined} />
            </div>
          ) : (
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
        {audienceProducts.length > 0 && (
          <div className="pt-4 mt-4" style={{ borderTop: "1px solid var(--color-rule)" }}>
            <p className="text-xs mb-1.5" style={{ color: "var(--color-ink-3)" }}>สินค้าขายดีจริงของกลุ่มนี้ (ไว้ประกอบการตัดสินใจเขียนโจทย์ — ไม่ได้ส่งให้ AI)</p>
            <p className="text-xs leading-relaxed" style={{ color: "var(--color-ink)" }}>{audienceProducts.join(", ")}</p>
          </div>
        )}
      </div>
    </aside>
    </div>
  );
}

interface ClickRow {
  code: string;
  clicked_at: string;
  confirmed_line_user_id: string | null;
  confirmed_at: string | null;
}

function CampaignDetailModal({ campaign, onClose }: { campaign: CampaignRecord; onClose: () => void }) {
  const [clicks, setClicks] = useState<ClickRow[]>([]);
  const [lineNames, setLineNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error: clicksError } = await supabase
        .from("campaign_clicks")
        .select("code,clicked_at,confirmed_line_user_id,confirmed_at")
        .eq("campaign_id", campaign.id)
        .order("clicked_at", { ascending: false });
      if (!active) return;
      if (clicksError) { setError(clicksError.message); setLoading(false); return; }
      const rows = data ?? [];
      setClicks(rows);

      const confirmedIds = Array.from(new Set(rows.map((r) => r.confirmed_line_user_id).filter((id): id is string => Boolean(id))));
      if (confirmedIds.length > 0) {
        const { data: users } = await supabase.from("line_users").select("line_user_id,display_name").in("line_user_id", confirmedIds);
        if (!active) return;
        const map: Record<string, string> = {};
        (users ?? []).forEach((u) => { map[u.line_user_id] = u.display_name ?? u.line_user_id; });
        setLineNames(map);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [campaign.id]);

  const confirmedCount = clicks.filter((c) => c.confirmed_line_user_id).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(26,25,23,0.4)", backdropFilter: "blur(3px)" }} onClick={onClose} />
      <div className="relative w-full flex flex-col" style={{ maxWidth: 560, maxHeight: "85vh", backgroundColor: "var(--color-surface)", borderRadius: 20, border: "1px solid var(--color-rule)", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid var(--color-rule)" }}>
          <p className="text-base font-semibold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>{campaign.name}</p>
          <button onClick={onClose} aria-label="ปิด" className="text-xl" style={{ color: "var(--color-ink-3)", background: "none", border: "none", cursor: "pointer" }}>×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {campaign.imageUrl && <img src={campaign.imageUrl} alt="" className="rounded-xl w-full" />}
          <div>
            <p className="text-xs font-medium mb-1.5" style={{ color: "var(--color-ink-3)" }}>ข้อความที่ส่ง</p>
            <p className="text-sm whitespace-pre-wrap rounded-xl px-4 py-3" style={{ backgroundColor: "var(--color-ground)", color: "var(--color-ink)", lineHeight: 1.6 }}>{campaign.message}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl px-4 py-3" style={{ backgroundColor: "var(--color-ground)" }}>
              <p className="text-xs" style={{ color: "var(--color-ink-3)" }}>คลิกลิงก์ทั้งหมด</p>
              <p className="text-2xl font-semibold tabular-nums" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>{clicks.length}</p>
            </div>
            <div className="rounded-xl px-4 py-3" style={{ backgroundColor: "var(--color-ground)" }}>
              <p className="text-xs" style={{ color: "var(--color-ink-3)" }}>ใช้โค้ดยืนยันแล้ว</p>
              <p className="text-2xl font-semibold tabular-nums" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>{confirmedCount}</p>
            </div>
          </div>
          {error && <p role="alert" className="text-xs" style={{ color: "#991B1B" }}>{error}</p>}
          {loading ? (
            <p className="text-xs" style={{ color: "var(--color-ink-3)" }}>กำลังโหลด…</p>
          ) : clicks.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: "var(--color-ink-3)" }}>ประวัติการคลิก</p>
              <div className="space-y-1.5">
                {clicks.map((c) => (
                  <div key={c.code} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: "var(--color-ground)" }}>
                    <span className="font-mono" style={{ color: "var(--color-ink-2)" }}>{c.code}</span>
                    <span style={{ color: c.confirmed_line_user_id ? "#166534" : "var(--color-ink-3)" }}>
                      {c.confirmed_line_user_id ? `ยืนยันแล้ว · ${lineNames[c.confirmed_line_user_id] ?? c.confirmed_line_user_id}` : "ยังไม่ยืนยัน"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-6 pb-5">
          <button onClick={onClose} className="w-full text-sm font-medium py-2.5 rounded-xl" style={{ backgroundColor: "var(--color-ink)", color: "#fff", border: "none", cursor: "pointer" }}>ปิด</button>
        </div>
      </div>
    </div>
  );
}

function HistoryTab({ canEdit }: { canEdit: boolean }) {
  const { campaigns, updateCampaignStatus, setCampaignPaused, sendCampaign } = useData();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<{ id: string; ok: boolean; message: string } | null>(null);
  const [viewingCampaign, setViewingCampaign] = useState<CampaignRecord | null>(null);

  async function copyTrackingLink(campaignId: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/api/track?c=${campaignId}`);
      setCopiedId(campaignId);
      setTimeout(() => setCopiedId((current) => (current === campaignId ? null : current)), 2000);
    } catch {
      // clipboard access denied — nothing actionable to show here
    }
  }

  async function handleSend(campaignId: string) {
    if (!window.confirm("ยืนยันส่งแคมเปญนี้ไปยังผู้ติดตาม LINE OA จริงหรือไม่?")) return;
    setSendingId(campaignId);
    setSendResult(null);
    try {
      const recipientCount = await sendCampaign(campaignId);
      setSendResult({ id: campaignId, ok: true, message: `ส่งสำเร็จถึง ${recipientCount.toLocaleString("th-TH")} คน` });
    } catch (err) {
      setSendResult({ id: campaignId, ok: false, message: err instanceof Error ? err.message : "ส่งแคมเปญไม่สำเร็จ" });
    } finally {
      setSendingId(null);
    }
  }

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
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: c.paused ? PAUSED_META.bg : s.bg, color: c.paused ? PAUSED_META.color : s.color }}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.paused ? PAUSED_META.color : s.color }} />{c.paused ? PAUSED_META.label : s.label}
                  </span>
                </td>
                <td className="px-3 py-3.5 text-xs" style={{ color: "var(--color-ink-2)" }}>{new Date(c.createdAt).toLocaleDateString("th-TH-u-ca-gregory")}</td>
                <td className="px-3 py-3.5 text-right">
                  <div className="flex flex-col items-end gap-1.5">
                  <div className="flex items-center justify-end gap-2">
                    {canEdit && c.status === "pending" && (
                      <>
                        <button onClick={() => void updateCampaignStatus(c.id, "approved")} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)", color: "var(--color-ink-2)", cursor: "pointer" }}>อนุมัติ</button>
                        <button onClick={() => void updateCampaignStatus(c.id, "rejected")} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: "transparent", border: "1px solid var(--color-rule)", color: "#991B1B", cursor: "pointer" }}>ไม่อนุมัติ</button>
                      </>
                    )}
                    {canEdit && (c.status === "approved" || c.status === "sent") && !c.paused && (
                      <>
                        {c.status === "approved" && (
                          <button onClick={() => void handleSend(c.id)} disabled={sendingId === c.id} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: "var(--color-ink)", color: "#fff", border: "none", cursor: sendingId === c.id ? "not-allowed" : "pointer", opacity: sendingId === c.id ? 0.6 : 1 }}>
                            {sendingId === c.id ? "กำลังส่ง…" : "ส่งเข้า LINE จริง"}
                          </button>
                        )}
                        <button onClick={() => void setCampaignPaused(c.id, true)} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)", color: "var(--color-ink-2)", cursor: "pointer" }}>หยุดชั่วคราว</button>
                        <button onClick={() => void updateCampaignStatus(c.id, "cancelled")} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: "transparent", border: "1px solid var(--color-rule)", color: "#991B1B", cursor: "pointer" }}>ยกเลิกแคมเปญ</button>
                      </>
                    )}
                    {canEdit && (c.status === "approved" || c.status === "sent") && c.paused && (
                      <>
                        <button onClick={() => void setCampaignPaused(c.id, false)} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: "var(--color-ink)", color: "#fff", border: "none", cursor: "pointer" }}>ดำเนินการต่อ</button>
                        <button onClick={() => void updateCampaignStatus(c.id, "cancelled")} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: "transparent", border: "1px solid var(--color-rule)", color: "#991B1B", cursor: "pointer" }}>ยกเลิกแคมเปญ</button>
                      </>
                    )}
                    {(c.status === "approved" || c.status === "sent") && (
                      <button onClick={() => void copyTrackingLink(c.id)} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: copiedId === c.id ? "#DCFCE7" : "var(--color-ground)", color: copiedId === c.id ? "#166534" : "var(--color-ink-2)", border: "1px solid var(--color-rule)", cursor: "pointer" }}>
                        {copiedId === c.id ? "คัดลอกแล้ว" : "คัดลอกลิงก์ติดตาม"}
                      </button>
                    )}
                    {!canEdit && c.status === "pending" && <span className="text-xs" style={{ color: "var(--color-ink-3)" }}>ดูอย่างเดียว</span>}
                    <button onClick={() => setViewingCampaign(c)} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)", color: "var(--color-ink-2)", cursor: "pointer" }}>
                      ดูรายละเอียด
                    </button>
                  </div>
                  {sendResult?.id === c.id && (
                    <p className="text-xs" style={{ color: sendResult.ok ? "#166534" : "#991B1B" }}>{sendResult.message}</p>
                  )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {viewingCampaign && <CampaignDetailModal campaign={viewingCampaign} onClose={() => setViewingCampaign(null)} />}
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
