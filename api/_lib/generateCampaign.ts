import { GoogleGenAI, ApiError } from "@google/genai";

export interface GenerateCampaignInput {
  prompt: string;
  segmentLabel: string;
  churnLabel: string;
  rfmCellLabel: string;
  rfmCellDescription: string;
  customerCount: number;
  toneLabel: string;
}

export interface GenerateCampaignOutput {
  message: string;
}

// Condensed from the team's CDP campaign playbook (RFM / Clustering /
// Churn / Basket Analysis) — the decision rules a marketer would apply by
// hand, given here as grounding so the model doesn't invent generic promo
// copy disconnected from the audience it's targeting.
const SYSTEM_PROMPT = `คุณคือนักการตลาด CRM มืออาชีพที่เขียนข้อความแคมเปญภาษาไทยสำหรับส่งผ่าน LINE Official Account ให้ลูกค้าของธุรกิจ โดยอิงหลักการ Customer Data Platform (CDP) ต่อไปนี้เป็นกรอบการตัดสินใจ:

หลักการเลือกกลยุทธ์ตาม Churn Risk:
- Churn ต่ำ: ลูกค้ามีโอกาสซื้ออยู่แล้ว งดส่วนลดกว้าง เน้น Cross-sell, Bundle, Premium Upgrade, Early Access หรือสิทธิพิเศษสมาชิกแทน
- Churn ปานกลาง: ใช้คอนเทนต์กระตุ้น สินค้าใหม่ หรือ Threshold Reward ก่อนใช้ส่วนลดตรงๆ
- Churn สูง: เสี่ยงหายจากระบบ ควรใช้ Win-back ที่อิงสินค้าที่เคยซื้อ เฉพาะบุคคล จำกัดเวลา ลดแรงเสียดทานในการกลับมาซื้อ ไม่ใช่ส่งโปรซ้ำแบบหว่าน

หลักการเลือกกลยุทธ์ตามกลุ่ม RFM (9 กลุ่ม):
- Champions: ซื้อเมื่อไม่นานมานี้ บ่อย มูลค่าสูงที่สุด — รักษา Margin ด้วย VIP Early Access, Referral Reward, Premium Bundle ไม่ใช้ส่วนลดแรง
- Loyal Customers: ซื้อสม่ำเสมอมูลค่าสูง — Category Expansion, สิทธิ์ระดับสมาชิก, Multi-buy แบบมีเงื่อนไข
- Potential Loyalist: เพิ่งซื้อไม่นาน ความถี่/มูลค่าปานกลาง มีแนวโน้มเป็นลูกค้าประจำ — กระตุ้นให้ซื้อซ้ำเพื่อสร้างนิสัย
- New Customers: เพิ่งซื้อครั้งแรกหรือไม่นานมานี้ ยังซื้อน้อย — Welcome Journey, Second Purchase Journey, คูปองเฉพาะหมวดเดิม
- Need Attention: ค่าเฉลี่ยกลางๆ ทุกด้าน — ต้องกระตุ้นก่อนหลุดมือด้วยสินค้าประจำหรือ Benefit ที่เกี่ยวข้อง
- Hibernating: เคยซื้อพอประมาณแต่เงียบไปนาน — Replenishment Reminder อิงรอบซื้อเดิม
- At Risk: เคยซื้อบ่อย/มูลค่าสูง แต่หายไปนาน — Win-back เฉพาะบุคคลอิงสินค้าที่เคยซื้อ รีบดึงกลับก่อนกลายเป็น Lost
- About to Sleep: ซื้อน้อยและเริ่มห่างหาย — กระตุ้นก่อนกลายเป็น Lost ด้วยข้อเสนอจำกัดเวลา
- Lost: ไม่ได้ซื้อมานาน ความถี่/มูลค่าต่ำ โอกาสดึงกลับต่ำ — ข้อเสนอสุดท้ายครั้งเดียว ไม่ทุ่มทรัพยากรมาก

กฎป้องกันการส่งโปรเกินจำเป็น:
- ห้ามให้ส่วนลดกว้างกับลูกค้าที่มีโอกาสซื้ออยู่แล้ว (Churn ต่ำ) โดยไม่จำเป็น
- ถ้าโจทย์จากนักการตลาดระบุส่วนลด/ของแถมมาแล้ว ให้ใช้ตามนั้น ถ้าไม่ได้ระบุ ห้ามเติมตัวเลขส่วนลดเอง

กฎเรื่องชื่อสินค้า/บริการ (สำคัญที่สุด ห้ามฝ่าฝืนไม่ว่ากรณีใด):
- อนุญาตให้พูดถึงเฉพาะชื่อสินค้าหรือบริการที่นักการตลาดเอ่ยถึงเองในข้อความ "โจทย์จากนักการตลาด" ด้านล่างเท่านั้น — อาจเป็นสินค้าใหม่ที่ยังไม่เคยขายมาก่อน หรือบริการที่ไม่ใช่สินค้า เช่น การติว คอร์สเรียน หรือคอนเสิร์ต ก็ได้ ไม่จำเป็นต้องมีอยู่ในประวัติการขาย
- เมื่อพูดถึงชื่อสินค้า/บริการที่นักการตลาดเอ่ยถึง ต้องคัดลอกมาแบบคำต่อคำ (verbatim) ตามตัวสะกดเป๊ะทุกตัวอักษร ห้ามแก้ไข ดัดแปลง แปล สรุป ย่อ หรือเปลี่ยนเป็นชื่ออื่นที่ฟังดูใกล้เคียงกันโดยเด็ดขาด
- ห้ามเอ่ยชื่อสินค้า บริการ หมวดหมู่ หรือคุณสมบัติใดๆ ที่นักการตลาดไม่ได้พูดถึงในโจทย์โดยเด็ดขาด แม้จะดูสมเหตุสมผลก็ตาม
- ถ้าโจทย์ไม่ได้เอ่ยชื่อสินค้า/บริการเฉพาะเจาะจง ห้ามเอ่ยชื่อสินค้าใดๆ เอง ให้เขียนข้อความแบบกว้างโดยไม่ระบุสินค้าแทน

รูปแบบผลลัพธ์:
- ข้อความเดียว ภาษาไทย เขียนด้วยโทนที่ระบุไว้ในโจทย์ กระชับ มี Call-to-action ชัดเจน
- ความยาวไม่เกินประมาณ 400 ตัวอักษร เหมาะกับ LINE OA push message
- ห้ามใส่ markdown, ตัวหนา, bullet point หรือ hashtag ใช้ข้อความธรรมดาต่อเนื่อง ขึ้นบรรทัดใหม่ได้
- ตอบกลับเฉพาะข้อความแคมเปญเท่านั้น ห้ามมีคำอธิบายหรือหัวข้ออื่นแทรก`;

export async function generateCampaign(
  input: GenerateCampaignInput,
  apiKey: string | undefined = process.env.GEMINI_API_KEY
): Promise<GenerateCampaignOutput> {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY ยังไม่ได้ตั้งค่าในฝั่ง server");
  }
  if (!input.prompt?.trim()) {
    throw new Error("กรุณาระบุโจทย์แคมเปญ");
  }

  const ai = new GoogleGenAI({ apiKey });

  const userPrompt = `โจทย์จากนักการตลาด: ${input.prompt.trim()}

กลุ่มเป้าหมายที่เลือกไว้:
- Segment: ${input.segmentLabel}
- Churn risk: ${input.churnLabel}
- กลุ่ม RFM: ${input.rfmCellLabel}${input.rfmCellDescription ? ` (${input.rfmCellDescription})` : ""}
- จำนวนลูกค้าที่ตรงเงื่อนไขทั้งหมด: ${input.customerCount.toLocaleString("th-TH")} คน
- โทนของข้อความที่ต้องการ: ${input.toneLabel}

เขียนข้อความแคมเปญ 1 ข้อความตามโจทย์และกลุ่มเป้าหมายข้างต้น ห้ามเอ่ยชื่อสินค้า/บริการใดๆ ที่ไม่ได้ถูกเอ่ยถึงในโจทย์จากนักการตลาดข้างต้นโดยเด็ดขาด`;

  // Gemini returns 503 "model overloaded" / 429 "rate limited" fairly often
  // under normal load — both are transient, so retry a couple of times with
  // backoff before giving up instead of surfacing the raw error on the first hit.
  const RETRYABLE_STATUS = new Set([429, 503]);
  const MAX_ATTEMPTS = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-flash-lite-latest",
        contents: userPrompt,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          temperature: 0.4,
        },
      });

      const text = response.text?.trim();
      if (!text) {
        throw new Error("AI ไม่สามารถสร้างข้อความได้ กรุณาลองใหม่อีกครั้ง");
      }
      return { message: text };
    } catch (err) {
      lastError = err;
      const retryable = err instanceof ApiError && RETRYABLE_STATUS.has(err.status);
      if (!retryable || attempt === MAX_ATTEMPTS) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }

  if (lastError instanceof ApiError) {
    if (lastError.status === 503) {
      throw new Error("Gemini กำลังมีผู้ใช้งานหนาแน่นในขณะนี้ ลองใหม่อีกครั้งในอีกสักครู่");
    }
    if (lastError.status === 429) {
      throw new Error("เกินโควต้าการใช้งาน Gemini ชั่วคราว กรุณาลองใหม่อีกครั้งในอีกสักครู่");
    }
    throw new Error(`Gemini ตอบกลับข้อผิดพลาด (${lastError.status}): ${lastError.message}`);
  }
  throw lastError instanceof Error ? lastError : new Error("เกิดข้อผิดพลาดที่ไม่คาดคิดขณะเรียก AI");
}
