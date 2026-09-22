import type { RawCustomer, RawTransaction, Customer } from "./types";

// Demo-only credentials for the POS simulator — there's no real POS to
// connect to, so these are the fixed values the Settings UI hints at.
export const MOCK_POS_KEY = "sk_live_demo_pos_2026";
export const MOCK_POS_ENDPOINT = "https://mockpos.cdp-platform.dev/webhook";
export const POS_TICK_MS = 3000;
// Prefixes distinguish simulator-generated rows from real imported/CSV data
// so a reset can remove exactly what the simulator added.
export const MOCK_POS_TX_PREFIX = "MOCKPOS-";
export const MOCK_POS_CUSTOMER_PREFIX = "MOCKCUS-";
// Roughly matches the real POS export mix (most rows are repeat purchases,
// a minority are brand-new signups).
const NEW_CUSTOMER_CHANCE = 0.2;

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function randomDigits(n: number) {
  return Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
}

interface CatalogEntry { product_id: string; product_name: string; category: string; unitPrice: number }

export function buildCatalog(transactions: RawTransaction[]): CatalogEntry[] {
  const byId = new Map<string, CatalogEntry>();
  for (const t of transactions) {
    if (!t.product_id || byId.has(t.product_id)) continue;
    const unitPrice = Number(t.unit_price);
    if (!unitPrice) continue;
    byId.set(t.product_id, { product_id: t.product_id, product_name: t.product_name, category: t.category, unitPrice });
  }
  return [...byId.values()];
}

export function generateMockTransaction(customerId: string, catalog: CatalogEntry[], branches: string[], paymentMethods: string[]): RawTransaction {
  const product = pickRandom(catalog);
  const quantity = Math.random() < 0.6 ? 1 : Math.floor(Math.random() * 3) + 2;
  const lineTotal = quantity * product.unitPrice;
  return {
    transaction_id: `${MOCK_POS_TX_PREFIX}${randomId()}`,
    customer_id: customerId,
    purchase_datetime: new Date().toISOString().slice(0, 19).replace("T", " "),
    product_id: product.product_id,
    product_name: product.product_name,
    category: product.category,
    quantity: String(quantity),
    unit_price: String(product.unitPrice),
    line_total: String(lineTotal),
    payment_method: pickRandom(paymentMethods),
    store_branch: pickRandom(branches),
  };
}

const FIRST_NAMES = ["สมชาย", "สมหญิง", "กมล", "วิภา", "ธนกร", "ปิยะดา", "อรุณ", "ชนิดา", "ณัฐพล", "พิมพ์ชนก", "เอกชัย", "สุภาพร", "วรรณา", "ประวิทย์", "รุ่งนภา", "ธีรภัทร"];
const LAST_NAMES = ["ใจดี", "รักเรียน", "แสงทอง", "ศรีสุข", "บุญมี", "มั่นคง", "เจริญสุข", "สายทอง", "วงศ์ษา", "ทองแท้", "ผลบุญ", "ดวงดี"];
const CHANNELS = ["walk-in", "Instagram", "Facebook", "LINE OA", "แนะนำจากเพื่อน", "Google"];

export function generateMockCustomer(provinces: string[]): RawCustomer {
  const first = pickRandom(FIRST_NAMES);
  const last = pickRandom(LAST_NAMES);
  const today = new Date().toISOString().slice(0, 10);
  return {
    customer_id: `${MOCK_POS_CUSTOMER_PREFIX}${randomId()}`,
    first_name: first,
    last_name: last,
    full_name: `${first} ${last}`,
    gender: pickRandom(["ชาย", "หญิง"]),
    phone: `08${randomDigits(8)}`,
    email: `${first.toLowerCase()}.${last.toLowerCase()}${randomDigits(3)}@example.com`,
    birthdate: `${1970 + Math.floor(Math.random() * 35)}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")}-${String(1 + Math.floor(Math.random() * 28)).padStart(2, "0")}`,
    address: "",
    district: "",
    province: provinces.length ? pickRandom(provinces) : "",
    postal_code: "",
    register_date: today,
    member_tier: "Bronze",
    points_balance: "0",
    acquisition_channel: pickRandom(CHANNELS),
    is_active: "TRUE",
  };
}

export interface PosTickResult {
  customer: RawCustomer | null;
  transaction: RawTransaction;
}

// One simulated "event" — either a repeat purchase from an existing member,
// or (less often) a brand-new signup followed by their first purchase.
export function generatePosTick(existingCustomers: Customer[], allRawCustomers: RawCustomer[], transactions: RawTransaction[]): PosTickResult | null {
  const catalog = buildCatalog(transactions);
  const branches = [...new Set(transactions.map((t) => t.store_branch).filter(Boolean))];
  const paymentMethods = [...new Set(transactions.map((t) => t.payment_method).filter(Boolean))];
  if (catalog.length === 0 || branches.length === 0 || paymentMethods.length === 0) return null;

  if (Math.random() < NEW_CUSTOMER_CHANCE) {
    const provinces = [...new Set(allRawCustomers.map((c) => c.province).filter(Boolean))];
    const customer = generateMockCustomer(provinces);
    return { customer, transaction: generateMockTransaction(customer.customer_id, catalog, branches, paymentMethods) };
  }

  if (existingCustomers.length === 0) return null;
  const customer = pickRandom(existingCustomers);
  return { customer: null, transaction: generateMockTransaction(customer.id, catalog, branches, paymentMethods) };
}
