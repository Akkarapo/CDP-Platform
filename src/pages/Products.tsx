import { useData } from "../lib/store";

const PALETTE = [
  { bg: "#1A1917", text: "#ffffff", dot: "#ffffff40" },
  { bg: "#E0E7FF", text: "#3730A3", dot: "#3730A340" },
  { bg: "#DCFCE7", text: "#166534", dot: "#16653440" },
  { bg: "#FEF3C7", text: "#92400E", dot: "#92400E40" },
  { bg: "#FEE2E2", text: "#991B1B", dot: "#991B1B40" },
  { bg: "#F3F4F6", text: "#374151", dot: "#37415140" },
];

function TrendCell({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <div className="inline-flex items-center gap-1 font-semibold tabular-nums text-sm" style={{ color: up ? "#166534" : "#991B1B" }}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ transform: up ? "none" : "rotate(180deg)", flexShrink: 0 }}>
        <path d="M6 9.5V2.5M2.5 6L6 2.5 9.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {Math.abs(value).toFixed(1)}%
    </div>
  );
}

function PairBar({ pct }: { pct: number }) {
  return (
    <div className="relative h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-rule)" }}>
      <div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: "var(--color-ink)", transition: "width 0.6s cubic-bezier(0.16,1,0.3,1)" }} />
    </div>
  );
}

export default function Products() {
  const { productStats, loading } = useData();
  const { topProducts, categories, pairs } = productStats;

  if (loading) {
    return <main className="max-w-5xl mx-auto px-6 py-8"><p style={{ color: "var(--color-ink-3)" }}>กำลังโหลดข้อมูล...</p></main>;
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}>Products</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--color-ink-3)" }}>วิเคราะห์สินค้าจากไฟล์ transactions.csv</p>
      </div>

      <section>
        <div className="mb-3">
          <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>สินค้าขายดี</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>10 อันดับยอดขายสูงสุด (ตามยอดขายรวม) · แนวโน้มเทียบครึ่งแรก/ครึ่งหลังของช่วงข้อมูล</p>
        </div>
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-rule)" }}>
                {["#", "ชื่อสินค้า", "หมวดหมู่", "ขายได้ (ชิ้น)", "ยอดขายรวม", "แนวโน้ม"].map((h, i) => (
                  <th key={h} className={`px-5 py-3 text-xs font-medium tracking-wide uppercase ${i === 0 ? "text-center w-10" : i >= 3 ? "text-right" : "text-left"}`} style={{ color: "var(--color-ink-3)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topProducts.map((p, i) => (
                <tr key={p.name} style={{ borderBottom: i < topProducts.length - 1 ? "1px solid var(--color-rule)" : "none" }}>
                  <td className="px-5 py-3.5 text-center">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-bold" style={{ backgroundColor: i < 3 ? "var(--color-ink)" : "var(--color-ground)", color: i < 3 ? "#fff" : "var(--color-ink-3)", border: i >= 3 ? "1px solid var(--color-rule)" : "none" }}>{i + 1}</span>
                  </td>
                  <td className="px-5 py-3.5 font-medium" style={{ color: "var(--color-ink)" }}>{p.name}</td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs px-2 py-0.5 rounded-md" style={{ backgroundColor: "var(--color-ground)", color: "var(--color-ink-2)", border: "1px solid var(--color-rule)" }}>{p.category}</span>
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums" style={{ color: "var(--color-ink-2)" }}>{p.sold.toLocaleString("th-TH")}</td>
                  <td className="px-5 py-3.5 text-right font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>฿{p.revenue.toLocaleString("th-TH")}</td>
                  <td className="px-5 py-3.5 text-right"><TrendCell value={p.trend} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-3">
          <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>สินค้าที่ลูกค้ามักซื้อร่วมกัน</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>คำนวณจากคู่สินค้าที่ลูกค้าคนเดียวกันเคยซื้อทั้งคู่ (แต่ละธุรกรรมมี 1 สินค้า จึงนับที่ระดับลูกค้าแทนบิล)</p>
        </div>
        {pairs.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-ink-3)" }}>ยังไม่มีข้อมูลเพียงพอ</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {pairs.map((pair, i) => (
              <div key={i} className="rounded-2xl px-5 py-4 flex flex-col gap-3" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-rule)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-xs font-medium px-2.5 py-1.5 rounded-lg text-center leading-snug" style={{ backgroundColor: "var(--color-ground)", color: "var(--color-ink)", border: "1px solid var(--color-rule)" }}>{pair.a}</span>
                  <span className="text-base flex-shrink-0" style={{ color: "var(--color-ink-3)" }}>+</span>
                  <span className="flex-1 text-xs font-medium px-2.5 py-1.5 rounded-lg text-center leading-snug" style={{ backgroundColor: "var(--color-ground)", color: "var(--color-ink)", border: "1px solid var(--color-rule)" }}>{pair.b}</span>
                </div>
                <PairBar pct={pair.pct} />
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: "var(--color-ink-3)" }}>{pair.count.toLocaleString("th-TH")} คนซื้อทั้งคู่</span>
                  <span className="text-sm font-bold" style={{ color: "var(--color-ink)" }}>{pair.pct}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3">
          <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>สินค้าตามหมวดหมู่</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>จัดกลุ่มตามคอลัมน์ category จริงในไฟล์ · {categories.reduce((s, c) => s + c.count, 0)} สินค้าใน {categories.length} หมวดหมู่</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {categories.map((cat, i) => {
            const palette = PALETTE[i % PALETTE.length];
            return (
              <div key={cat.name} className="rounded-2xl px-5 py-5 flex flex-col gap-3" style={{ backgroundColor: palette.bg, border: "1px solid transparent", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: palette.text }}>{cat.name}</p>
                    <p className="text-xs mt-0.5 leading-relaxed" style={{ color: palette.text, opacity: 0.7 }}>ยอดขายรวม ฿{cat.revenue.toLocaleString("th-TH")}</p>
                  </div>
                  <span className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full tabular-nums" style={{ backgroundColor: palette.dot, color: palette.text }}>{cat.count} สินค้า</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {cat.items.slice(0, 5).map((item) => (
                    <span key={item} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ backgroundColor: palette.dot, color: palette.text }}>{item}</span>
                  ))}
                  {cat.items.length > 5 && (
                    <span className="text-xs px-2.5 py-1 rounded-lg" style={{ backgroundColor: palette.dot, color: palette.text, opacity: 0.6 }}>+{cat.items.length - 5} อื่นๆ</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
