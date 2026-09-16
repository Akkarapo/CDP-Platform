# CDP Platform

Customer Data Platform — Vite + React + TypeScript + Tailwind + react-router + recharts

ทุกหน้าคำนวณจากข้อมูลจริงในไฟล์ CSV (`public/data/customers.csv`, `public/data/transactions.csv`) ไม่มีข้อมูล mock ค้างอยู่:

- **Dashboard**: จำนวนลูกค้า, ยอดขายรวม, ยอดขายรายวัน 30 วันล่าสุด, สัดส่วน Segment — คำนวณจาก CSV ทั้งหมด
- **Customers**: ค้นหา/กรองลูกค้าจริง 100 ราย พร้อม RFM score, churn risk, ประวัติการซื้อรายเดือน — คำนวณจากธุรกรรมจริง
- **Products**: สินค้าขายดี, หมวดหมู่ (จากคอลัมน์ `category` จริง), คู่สินค้าที่ซื้อร่วมกัน (คำนวณระดับลูกค้า เพราะแต่ละธุรกรรมมี 1 สินค้า)
- **Import**: อัปโหลดไฟล์ CSV ลูกค้า/ธุรกรรมเพิ่มเติมได้จริง ข้อมูลจะรวมเข้ากับชุดข้อมูลหลักและถูกเก็บไว้ใน localStorage ของเบราว์เซอร์
- **Campaigns**: สร้าง/อนุมัติ/ส่งแคมเปญจริง (เก็บใน localStorage) ข้อความแคมเปญถูกเติมด้วยสินค้าขายดีจริงของกลุ่มเป้าหมาย
- **Settings**: แสดงบัญชี Google ที่ล็อกอินจริง, ออกจากระบบจริง
- **Login**: เข้าสู่ระบบด้วย Google จริงผ่าน Google Identity Services

## การตั้งค่า Google Sign-In (จำเป็นสำหรับการ login จริง)

1. ไปที่ [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. สร้างโปรเจกต์ใหม่ (ถ้ายังไม่มี) แล้วสร้าง **OAuth client ID** ชนิด **Web application**
3. ใส่ **Authorized JavaScript origins**:
   - `http://localhost:5173` (สำหรับ dev)
   - โดเมน Vercel ของโปรเจกต์นี้ (เช่น `https://cdp-platform.vercel.app`)
4. คัดลอก Client ID ที่ได้ ไปใส่เป็นตัวแปรแวดล้อม `VITE_GOOGLE_CLIENT_ID`:
   - ในเครื่อง: คัดลอก `.env.example` เป็น `.env` แล้วใส่ค่า
   - บน Vercel: Project Settings → Environment Variables

ถ้ายังไม่ตั้งค่า ตัวแปรนี้ หน้า Login จะแจ้งเตือนและ (เฉพาะตอนรัน `npm run dev`) จะมีปุ่ม "โหมดพัฒนา" ให้ทดสอบ UI โดยไม่ต้องผ่าน Google จริง — โหมดนี้จะไม่ปรากฏใน production build

## รันโปรเจกต์

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # build ไปที่ dist/
```

## Deploy บน Vercel

1. Import repo `Akkarapo/CDP-Platform` เข้า Vercel (Framework Preset: Vite จะถูกตรวจพบอัตโนมัติ)
2. ตั้งค่า Environment Variable `VITE_GOOGLE_CLIENT_ID`
3. อย่าลืมเพิ่มโดเมน Vercel ที่ได้ ไปใน Authorized JavaScript origins ของ Google OAuth client ด้วย
4. `vercel.json` มี rewrite rule ให้ทุก route กลับไปที่ `index.html` แล้ว (จำเป็นสำหรับ client-side routing ของ react-router)

## ข้อจำกัด / การลดความซับซ้อนโดยตั้งใจ (ponytail)

- **การยืนยันตัวตน**: ตรวจสอบ ID token จาก Google ฝั่ง client เท่านั้น (ไม่มี backend ให้ verify signature ฝั่ง server) — ถ้าจะนำไป production จริงควรเพิ่ม backend verification
- **แนวโน้มสินค้า (trend)**: เปรียบเทียบยอดขายครึ่งแรก/ครึ่งหลังของช่วงข้อมูลที่มี ไม่ใช่โมเดลพยากรณ์จริง
- **การจัดกลุ่มสินค้า**: ใช้คอลัมน์ `category` จริงแทนการทำ behavioral clustering
- **ข้อความแคมเปญ**: เติมสินค้าขายดีจริงลงเทมเพลตข้อความ ไม่ได้เรียก AI API จริง (ต้องมี backend + API key)
- **POS API / LINE OA**: ยังไม่ได้เชื่อมต่อจริง เป็นเพียงฟอร์มบันทึกค่าไว้ใน localStorage
- **การเก็บข้อมูลที่ import เพิ่ม**: เก็บใน localStorage ของเบราว์เซอร์ (ไม่มี backend/ฐานข้อมูลจริง) จึงไม่ sync ข้ามเครื่อง/เบราว์เซอร์
