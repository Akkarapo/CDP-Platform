import { useState, useRef, useEffect } from "react";
import { useData } from "../lib/store";

function StatusBadge({ status }: { status: "success" | "error" }) {
  const m = status === "success" ? { label: "สำเร็จ", bg: "#DCFCE7", color: "#166534" } : { label: "ผิดพลาด", bg: "#FEE2E2", color: "#991B1B" };
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: m.bg, color: m.color }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: m.color }} />
      {m.label}
    </span>
  );
}

function UploadModal({ onClose }: { onClose: () => void }) {
  const { importCsvFile } = useData();
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Record<string, string>[] | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  async function handleFile(file: File) {
    setFileName(file.name);
    const text = await file.text();
    const res = importCsvFile(file.name, text);
    setPreview(res.preview);
    setResult({ ok: res.ok, message: res.message });
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(26,25,23,0.4)", backdropFilter: "blur(3px)" }} onClick={onClose} />
      <div className="relative w-full flex flex-col" style={{ maxWidth: 640, maxHeight: "90vh", backgroundColor: "var(--color-surface)", borderRadius: 20, border: "1px solid var(--color-rule)", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid var(--color-rule)" }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>
              {result ? `ผลการนำเข้า — ${fileName}` : "อัปโหลดไฟล์ CSV"}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>
              {result ? "" : "รองรับไฟล์ CSV ของลูกค้า (customer_id, full_name, ...), ธุรกรรม (transaction_id, product_name, ...) หรือ event log แบบรวม (event_id, event_type, ...)"}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: "var(--color-ink-3)", background: "none", border: "none", cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {!result && (
            <div
              className="flex flex-col items-center justify-center rounded-2xl py-16 gap-4"
              style={{ border: `2px dashed ${dragging ? "var(--color-ink)" : "var(--color-rule)"}`, backgroundColor: dragging ? "var(--color-ground)" : "transparent", cursor: "pointer" }}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
            >
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 3v13M7 8l5-5 5 5" stroke="var(--color-ink)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2" stroke="var(--color-ink-3)" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์</p>
                <p className="text-xs mt-1" style={{ color: "var(--color-ink-3)" }}>.csv</p>
              </div>
              <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <p className="text-sm px-4 py-3 rounded-xl" style={{ backgroundColor: result.ok ? "#DCFCE7" : "#FEE2E2", color: result.ok ? "#166534" : "#991B1B" }}>{result.message}</p>
              {preview && preview.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--color-ink-3)" }}>ตัวอย่างข้อมูล ({preview.length} แถวแรก)</p>
                  <div className="rounded-xl overflow-auto" style={{ border: "1px solid var(--color-rule)" }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ backgroundColor: "var(--color-ground)", borderBottom: "1px solid var(--color-rule)" }}>
                          {Object.keys(preview[0]).map((h) => (
                            <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: "var(--color-ink-2)", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((row, i) => (
                          <tr key={i} style={{ borderBottom: i < preview.length - 1 ? "1px solid var(--color-rule)" : "none" }}>
                            {Object.values(row).map((v, j) => <td key={j} className="px-3 py-2" style={{ color: "var(--color-ink)" }}>{v}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4" style={{ borderTop: "1px solid var(--color-rule)" }}>
          <button onClick={onClose} className="w-full text-sm font-medium py-2.5 rounded-xl" style={{ backgroundColor: "var(--color-ink)", color: "#fff", border: "none", cursor: "pointer" }}>ปิด</button>
        </div>
      </div>
    </div>
  );
}

export default function Import() {
  const { importLog, rawTransactions, customers, removeImport, clearAllImports } = useData();
  const [modalOpen, setModalOpen] = useState(false);

  function handleRemove(id: string) {
    if (window.confirm("ยกเลิกการนำเข้ารายการนี้และลบข้อมูลที่นำเข้ามาทั้งหมด?")) removeImport(id);
  }

  function handleClearAll() {
    if (window.confirm("ล้างข้อมูลที่นำเข้าทั้งหมด (ทุกไฟล์) และกลับไปใช้ข้อมูลตั้งต้นเท่านั้น?")) clearAllImports();
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>Import</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--color-ink-3)" }}>นำเข้าข้อมูลลูกค้า/ธุรกรรมเพิ่มเติมจากไฟล์ CSV</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl p-5 flex flex-col gap-4" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)" }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="2" width="14" height="16" rx="2" stroke="var(--color-ink)" strokeWidth="1.5" /><path d="M7 7h6M7 10h6M7 13h4" stroke="var(--color-ink-3)" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </div>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>CSV Import</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>ปัจจุบันมีลูกค้า {customers.length.toLocaleString("th-TH")} ราย, ธุรกรรม {rawTransactions.length.toLocaleString("th-TH")} รายการ</p>
          </div>
          <button onClick={() => setModalOpen(true)} className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium" style={{ backgroundColor: "var(--color-ink)", color: "#fff", border: "none", cursor: "pointer" }}>
            อัปโหลดไฟล์ CSV
          </button>
        </div>

        <div className="rounded-2xl p-5 flex flex-col gap-4" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "var(--color-ground)", border: "1px solid var(--color-rule)" }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2" y="5" width="16" height="11" rx="2" stroke="var(--color-ink)" strokeWidth="1.5" /><path d="M6 9h2M10 9h2M6 12h2M10 12h2M14 9h.5M14 12h.5" stroke="var(--color-ink-3)" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>POS API / LINE OA</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>ยังไม่ได้เชื่อมต่อ — ต้องใช้ backend และ credential จริงจึงจะดึงข้อมูลอัตโนมัติได้ ตั้งค่าได้ที่หน้า Settings</p>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>ประวัติการนำเข้า</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>รายการทั้งหมด {importLog.length} รายการ</p>
          </div>
          {importLog.length > 0 && (
            <button onClick={handleClearAll} className="text-xs font-medium px-3 py-1.5 rounded-lg" style={{ backgroundColor: "var(--color-ground)", color: "var(--color-ink-2)", border: "1px solid var(--color-rule)", cursor: "pointer" }}>
              ล้างข้อมูลที่นำเข้าทั้งหมด
            </button>
          )}
        </div>
        {importLog.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-ink-3)" }}>ยังไม่มีการนำเข้าไฟล์เพิ่มเติม (ข้อมูลเริ่มต้นมาจาก customers.csv และ transactions.csv)</p>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-rule)" }}>
                  {["วันที่ / เวลา", "ช่องทาง", "จำนวนแถว", "สถานะ", ""].map((h, i) => (
                    <th key={h || "actions"} className={`px-6 py-3 text-xs font-medium tracking-wide uppercase ${i === 2 ? "text-right" : "text-left"}`} style={{ color: "var(--color-ink-3)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {importLog.map((log, i) => {
                  const canUndo = log.status === "success" && (log.customerIds !== undefined || log.transactionIds !== undefined);
                  return (
                    <tr key={log.id} style={{ borderBottom: i < importLog.length - 1 ? "1px solid var(--color-rule)" : "none" }}>
                      <td className="px-6 py-3.5 text-xs" style={{ color: "var(--color-ink-2)" }}>{log.date}</td>
                      <td className="px-6 py-3.5"><span className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>{log.channel}</span></td>
                      <td className="px-6 py-3.5 text-right font-semibold tabular-nums text-sm" style={{ color: log.rows === 0 ? "var(--color-ink-3)" : "var(--color-ink)" }}>{log.rows === 0 ? "—" : log.rows.toLocaleString("th-TH")}</td>
                      <td className="px-6 py-3.5"><StatusBadge status={log.status} /></td>
                      <td className="px-6 py-3.5 text-right">
                        {canUndo ? (
                          <button onClick={() => handleRemove(log.id)} className="text-xs font-medium" style={{ background: "none", border: "none", color: "var(--color-ink-3)", cursor: "pointer" }}>
                            ลบ
                          </button>
                        ) : log.status === "success" ? (
                          <span className="text-xs" style={{ color: "var(--color-ink-3)" }} title="นำเข้าก่อนมีฟีเจอร์นี้ — ใช้ปุ่ม &quot;ล้างข้อมูลที่นำเข้าทั้งหมด&quot; แทน">—</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && <UploadModal onClose={() => setModalOpen(false)} />}
    </main>
  );
}
