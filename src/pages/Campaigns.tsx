import { useMemo, useState } from "react";
import { useLocation } from "react-router";
import { useData } from "../lib/store";
import { buildProductStats } from "../lib/analytics";
import type { Segment, CampaignRecord } from "../lib/types";

type Target = Segment | "ทุก Segment";
const TARGETS: Target[] = ["Premium", "Regular", "New", "Dormant", "ทุก Segment"];

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
  const [prompt, setPrompt] = useState("");
  const [generated, setGenerated] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const suggestedProducts = useMemo(() => {
    const members = target && target !== "ทุก Segment" ? customers.filter((c) => c.segment === target) : customers;
    const memberIds = new Set(members.map((c) => c.id));
    const segTx = rawTransactions.filter((t) => memberIds.has(t.customer_id));
    return buildProductStats(segTx).topProducts.slice(0, 3).map((p) => p.name);
  }, [target, customers, rawTransactions]);

  const targetCount = target === "ทุก Segment" || !target
    ? customers.length
    : customers.filter((c) => c.segment === target).length;

  // Template-based message generator: fills in the real target-segment
  // product data into a message template. ponytail: not a real LLM call
  // (that needs a backend + API key this static SPA doesn't have) — swap
  // for a real generation API if a backend gets added.
  const handleGenerate = () => {
    if (!prompt.trim() || !target) return;
    const productLine = suggestedProducts.length ? `แนะนำ: ${suggestedProducts.join(", ")}` : "";
    setGenerated(
      `สวัสดีค่ะ 👋\n\n${prompt.trim()}\n\n${productLine}\n\nกลุ่มเป้าหมาย: ${target} (${targetCount.toLocaleString("th-TH")} คน)`
    );
  };

  const handleSubmit = () => {
    if (!target || !generated) return;
    addCampaign({ name: prompt.slice(0, 40) || `แคมเปญสำหรับ ${target}`, targetSegment: target, status: "pending", message: generated });
    setSubmitted(true);
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
        <button onClick={() => { setSubmitted(false); setTarget(null); setPrompt(""); setGenerated(""); }} className="mt-2 px-5 py-2 rounded-xl text-sm font-medium" style={{ backgroundColor: "var(--color-ink)", color: "#fff", border: "none", cursor: "pointer" }}>
          สร้างแคมเปญใหม่
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <section>
        <p className="text-sm font-semibold mb-1" style={{ color: "var(--color-ink)" }}>
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs mr-2 font-bold" style={{ backgroundColor: "var(--color-ink)", color: "#fff" }}>1</span>
          เลือกกลุ่มเป้าหมาย
        </p>
        <p className="text-xs mb-3 ml-7" style={{ color: "var(--color-ink-3)" }}>จำนวนลูกค้าคำนวณจากข้อมูลจริงในไฟล์ CSV</p>
        <div className="grid grid-cols-2 gap-2.5 ml-7">
          {TARGETS.map((t) => {
            const active = target === t;
            const count = t === "ทุก Segment" ? customers.length : customers.filter((c) => c.segment === t).length;
            return (
              <button key={t} onClick={() => setTarget(t)} className="text-left rounded-xl px-4 py-3.5" style={{ backgroundColor: active ? "var(--color-ink)" : "var(--color-surface)", border: `1.5px solid ${active ? "var(--color-ink)" : "var(--color-rule)"}`, cursor: "pointer" }}>
                <p className="text-sm font-semibold" style={{ color: active ? "#fff" : "var(--color-ink)" }}>{t}</p>
                <p className="text-xs mt-1.5 font-medium tabular-nums" style={{ color: active ? "rgba(255,255,255,0.9)" : "var(--color-ink-2)" }}>{count.toLocaleString("th-TH")} คน</p>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <p className="text-sm font-semibold mb-1" style={{ color: "var(--color-ink)" }}>
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs mr-2 font-bold" style={{ backgroundColor: "var(--color-ink)", color: "#fff" }}>2</span>
          ข้อความแคมเปญ
        </p>
        <p className="text-xs mb-3 ml-7" style={{ color: "var(--color-ink-3)" }}>อธิบายสิ่งที่อยากสื่อสาร ระบบจะเติมสินค้าขายดีจริงของกลุ่มนี้ให้อัตโนมัติ</p>
        <div className="ml-7 space-y-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="เช่น: เชิญลูกค้าเข้าร่วม Early Access สินค้าใหม่ พร้อมโค้ดส่วนลด 15%"
            rows={3}
            className="w-full rounded-xl px-4 py-3 text-sm resize-none outline-none"
            style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", color: "var(--color-ink)", lineHeight: 1.6 }}
          />
          {target && suggestedProducts.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)" }}>
              <div className="flex-1 min-w-0">
                <p className="text-xs mb-1" style={{ color: "var(--color-ink-3)" }}>สินค้าขายดีจริงของกลุ่มนี้ (จะแนบให้อัตโนมัติ): {suggestedProducts.join(", ")}</p>
              </div>
            </div>
          )}
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || !target}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
            style={{ backgroundColor: !prompt.trim() || !target ? "var(--color-ground)" : "var(--color-ink)", color: !prompt.trim() || !target ? "var(--color-ink-3)" : "#fff", border: "none", cursor: !prompt.trim() || !target ? "not-allowed" : "pointer" }}
          >
            สร้างข้อความ
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
              <p className="text-sm" style={{ color: "var(--color-ink-3)" }}>{target ? "กด \"สร้างข้อความ\"" : "เลือกกลุ่มเป้าหมายก่อน"}</p>
            </div>
          )}
        </div>
      </section>

      <div className="ml-7 pb-4">
        <button onClick={handleSubmit} disabled={!generated} className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-sm font-semibold" style={{ backgroundColor: generated ? "var(--color-ink)" : "var(--color-ground)", color: generated ? "#fff" : "var(--color-ink-3)", border: "none", cursor: generated ? "pointer" : "not-allowed" }}>
          บันทึกแคมเปญ
        </button>
      </div>
    </div>
  );
}

function HistoryTab() {
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
                <td className="px-3 py-3.5 text-xs" style={{ color: "var(--color-ink-2)" }}>{c.targetSegment}</td>
                <td className="px-3 py-3.5">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: s.bg, color: s.color }}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />{s.label}
                  </span>
                </td>
                <td className="px-3 py-3.5 text-xs" style={{ color: "var(--color-ink-2)" }}>{new Date(c.createdAt).toLocaleDateString("th-TH-u-ca-gregory")}</td>
                <td className="px-3 py-3.5 text-right">
                  {c.status === "pending" && (
                    <button onClick={() => updateCampaignStatus(c.id, "approved")} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)", color: "var(--color-ink-2)", cursor: "pointer" }}>อนุมัติ</button>
                  )}
                  {c.status === "approved" && (
                    <button onClick={() => updateCampaignStatus(c.id, "sent")} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: "var(--color-ink)", color: "#fff", border: "none", cursor: "pointer" }}>ทำเครื่องหมายว่าส่งแล้ว</button>
                  )}
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
  const location = useLocation();
  const preselectedSegment = (location.state as any)?.preselectedSegment as Segment | undefined;
  const [tab, setTab] = useState<"create" | "history">("create");

  return (
    <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>Campaigns</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--color-ink-3)" }}>สร้างและจัดการแคมเปญการตลาดจากข้อมูลลูกค้าจริง</p>
      </div>

      <div className="flex gap-1" style={{ borderBottom: "1px solid var(--color-rule)" }}>
        {[{ id: "create", label: "สร้างแคมเปญ" }, { id: "history", label: "ประวัติแคมเปญ" }].map((t) => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id as "create" | "history")} className="px-4 py-2.5 text-sm font-medium relative" style={{ color: active ? "var(--color-ink)" : "var(--color-ink-3)", background: "none", border: "none", cursor: "pointer", marginBottom: -1 }}>
              {t.label}
              {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ backgroundColor: "var(--color-ink)" }} />}
            </button>
          );
        })}
      </div>

      {tab === "create" && <CreateTab preselected={preselectedSegment} />}
      {tab === "history" && <HistoryTab />}
    </main>
  );
}
