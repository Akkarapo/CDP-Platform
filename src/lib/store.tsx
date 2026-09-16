import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchCsv, parseCsv } from "./csv";
import { buildCustomers, buildProductStats } from "./analytics";
import type { RawCustomer, RawTransaction, Customer, CampaignRecord, ImportLogEntry, Segment } from "./types";

const LS_KEYS = {
  extraCustomers: "cdp.extraCustomers",
  extraTransactions: "cdp.extraTransactions",
  campaigns: "cdp.campaigns",
  importLog: "cdp.importLog",
};

function loadLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveLS<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ponytail: best-effort persistence, ignore quota/serialize errors */
  }
}

const CUSTOMER_HEADERS = ["customer_id", "full_name", "phone", "email", "member_tier"];
const TRANSACTION_HEADERS = ["transaction_id", "customer_id", "product_name", "line_total"];
// POS "combined" export: one row per event (registration / purchase / return /
// points redemption), sharing customer and product columns on the same line
// instead of splitting them into separate customer and transaction files.
const EVENT_LOG_HEADERS = ["event_id", "event_type", "event_datetime", "customer_id", "product_id", "full_name"];

function splitEventLog(rows: Record<string, string>[], existingCustomerIds: Set<string>) {
  const customers: RawCustomer[] = [];
  const seenCustomerIds = new Set<string>();
  const transactions: RawTransaction[] = [];
  for (const r of rows) {
    if (r.product_id) {
      transactions.push({
        transaction_id: r.event_id,
        customer_id: r.customer_id,
        purchase_datetime: r.event_datetime,
        product_id: r.product_id,
        product_name: r.product_name,
        category: r.category,
        quantity: r.quantity,
        unit_price: r.unit_price,
        line_total: r.line_total,
        payment_method: r.payment_method,
        store_branch: r.store_branch,
      });
    }
    // Bio columns are only populated for members (registration + their own
    // purchase rows); guest rows leave full_name blank and are skipped here.
    if (r.full_name && !seenCustomerIds.has(r.customer_id) && !existingCustomerIds.has(r.customer_id)) {
      seenCustomerIds.add(r.customer_id);
      customers.push({
        customer_id: r.customer_id,
        first_name: r.first_name,
        last_name: r.last_name,
        full_name: r.full_name,
        gender: r.gender,
        phone: r.phone,
        email: r.email,
        birthdate: r.birthdate,
        address: r.address,
        district: r.district,
        province: r.province,
        postal_code: r.postal_code,
        register_date: r.register_date,
        member_tier: r.member_tier,
        points_balance: r.points_balance,
        acquisition_channel: r.acquisition_channel,
        is_active: r.is_active,
      });
    }
  }
  return { customers, transactions };
}

interface DataContextValue {
  loading: boolean;
  error: string | null;
  customers: Customer[];
  rawTransactions: RawTransaction[];
  productStats: ReturnType<typeof buildProductStats>;
  campaigns: CampaignRecord[];
  addCampaign: (c: Omit<CampaignRecord, "id" | "createdAt">) => void;
  updateCampaignStatus: (id: string, status: CampaignRecord["status"]) => void;
  importLog: ImportLogEntry[];
  importCsvFile: (fileName: string, text: string) => { ok: boolean; message: string; preview: Record<string, string>[] };
  removeImport: (id: string) => void;
  clearAllImports: () => void;
  segmentCounts: Record<Segment, number>;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [baseCustomers, setBaseCustomers] = useState<RawCustomer[]>([]);
  const [baseTransactions, setBaseTransactions] = useState<RawTransaction[]>([]);
  const [extraCustomers, setExtraCustomers] = useState<RawCustomer[]>(() => loadLS(LS_KEYS.extraCustomers, []));
  const [extraTransactions, setExtraTransactions] = useState<RawTransaction[]>(() => loadLS(LS_KEYS.extraTransactions, []));
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>(() => loadLS(LS_KEYS.campaigns, []));
  const [importLog, setImportLog] = useState<ImportLogEntry[]>(() => loadLS(LS_KEYS.importLog, []));

  useEffect(() => {
    Promise.all([fetchCsv("/data/customers.csv"), fetchCsv("/data/transactions.csv")])
      .then(([c, t]) => {
        setBaseCustomers(c as unknown as RawCustomer[]);
        setBaseTransactions(t as unknown as RawTransaction[]);
      })
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  }, []);

  const allCustomersRaw = useMemo(() => [...baseCustomers, ...extraCustomers], [baseCustomers, extraCustomers]);
  const allTransactionsRaw = useMemo(() => [...baseTransactions, ...extraTransactions], [baseTransactions, extraTransactions]);

  const customers = useMemo(
    () => buildCustomers(allCustomersRaw, allTransactionsRaw, campaigns),
    [allCustomersRaw, allTransactionsRaw, campaigns]
  );
  const productStats = useMemo(() => buildProductStats(allTransactionsRaw), [allTransactionsRaw]);

  const segmentCounts = useMemo(() => {
    const counts: Record<Segment, number> = { Premium: 0, Regular: 0, New: 0, Dormant: 0 };
    for (const c of customers) counts[c.segment]++;
    return counts;
  }, [customers]);

  function addCampaign(c: Omit<CampaignRecord, "id" | "createdAt">) {
    setCampaigns((prev) => {
      const next = [{ ...c, id: `camp_${Date.now()}`, createdAt: new Date().toISOString() }, ...prev];
      saveLS(LS_KEYS.campaigns, next);
      return next;
    });
  }
  function updateCampaignStatus(id: string, status: CampaignRecord["status"]) {
    setCampaigns((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, status } : c));
      saveLS(LS_KEYS.campaigns, next);
      return next;
    });
  }

  function importCsvFile(fileName: string, text: string) {
    const rows = parseCsv(text);
    if (rows.length === 0) {
      return { ok: false, message: "ไฟล์ว่างเปล่าหรืออ่านไม่ได้", preview: [] };
    }
    const headers = Object.keys(rows[0]);
    const isEventLog = EVENT_LOG_HEADERS.every((h) => headers.includes(h));
    const isCustomers = CUSTOMER_HEADERS.every((h) => headers.includes(h));
    const isTransactions = TRANSACTION_HEADERS.every((h) => headers.includes(h));

    const importId = `imp_${Date.now()}`;
    let entry: ImportLogEntry;
    if (isEventLog) {
      const existingCustomerIds = new Set(allCustomersRaw.map((c) => c.customer_id));
      const { customers: newCustomers, transactions: newTransactions } = splitEventLog(rows, existingCustomerIds);
      setExtraCustomers((prev) => {
        const next = [...prev, ...newCustomers];
        saveLS(LS_KEYS.extraCustomers, next);
        return next;
      });
      setExtraTransactions((prev) => {
        const next = [...prev, ...newTransactions];
        saveLS(LS_KEYS.extraTransactions, next);
        return next;
      });
      entry = {
        id: importId,
        date: new Date().toLocaleString("th-TH"),
        channel: "CSV/Excel",
        rows: rows.length,
        status: "success",
        fileName,
        customerIds: newCustomers.map((c) => c.customer_id),
        transactionIds: newTransactions.map((t) => t.transaction_id),
      };
      setImportLog((prev) => {
        const next = [entry, ...prev];
        saveLS(LS_KEYS.importLog, next);
        return next;
      });
      return {
        ok: true,
        message: `นำเข้าแล้ว ${newCustomers.length} ลูกค้าใหม่ และ ${newTransactions.length} ธุรกรรมจากไฟล์ "${fileName}"`,
        preview: rows.slice(0, 5),
      };
    } else if (isTransactions) {
      const newTransactions = rows as unknown as RawTransaction[];
      setExtraTransactions((prev) => {
        const next = [...prev, ...newTransactions];
        saveLS(LS_KEYS.extraTransactions, next);
        return next;
      });
      entry = {
        id: importId,
        date: new Date().toLocaleString("th-TH"),
        channel: "CSV/Excel",
        rows: rows.length,
        status: "success",
        fileName,
        transactionIds: newTransactions.map((t) => t.transaction_id),
      };
    } else if (isCustomers) {
      const newCustomers = rows as unknown as RawCustomer[];
      setExtraCustomers((prev) => {
        const next = [...prev, ...newCustomers];
        saveLS(LS_KEYS.extraCustomers, next);
        return next;
      });
      entry = {
        id: importId,
        date: new Date().toLocaleString("th-TH"),
        channel: "CSV/Excel",
        rows: rows.length,
        status: "success",
        fileName,
        customerIds: newCustomers.map((c) => c.customer_id),
      };
    } else {
      entry = {
        id: importId,
        date: new Date().toLocaleString("th-TH"),
        channel: "CSV/Excel",
        rows: 0,
        status: "error",
        note: `ไม่พบคอลัมน์ที่จำเป็น (ต้องมี ${CUSTOMER_HEADERS.join(", ")} สำหรับไฟล์ลูกค้า หรือ ${TRANSACTION_HEADERS.join(", ")} สำหรับไฟล์ธุรกรรม)`,
      };
      setImportLog((prev) => {
        const next = [entry, ...prev];
        saveLS(LS_KEYS.importLog, next);
        return next;
      });
      return { ok: false, message: `ไฟล์ "${fileName}" ไม่ตรงกับโครงสร้างที่รองรับ`, preview: rows.slice(0, 5) };
    }

    setImportLog((prev) => {
      const next = [entry, ...prev];
      saveLS(LS_KEYS.importLog, next);
      return next;
    });
    return { ok: true, message: `นำเข้าแล้ว ${rows.length} แถวจากไฟล์ "${fileName}"`, preview: rows.slice(0, 5) };
  }

  function removeImport(id: string) {
    const target = importLog.find((e) => e.id === id);
    if (!target) return;
    if (target.customerIds?.length) {
      const remove = new Set(target.customerIds);
      setExtraCustomers((prev) => {
        const next = prev.filter((c) => !remove.has(c.customer_id));
        saveLS(LS_KEYS.extraCustomers, next);
        return next;
      });
    }
    if (target.transactionIds?.length) {
      const remove = new Set(target.transactionIds);
      setExtraTransactions((prev) => {
        const next = prev.filter((t) => !remove.has(t.transaction_id));
        saveLS(LS_KEYS.extraTransactions, next);
        return next;
      });
    }
    setImportLog((prev) => {
      const next = prev.filter((e) => e.id !== id);
      saveLS(LS_KEYS.importLog, next);
      return next;
    });
  }

  function clearAllImports() {
    setExtraCustomers(() => {
      saveLS(LS_KEYS.extraCustomers, []);
      return [];
    });
    setExtraTransactions(() => {
      saveLS(LS_KEYS.extraTransactions, []);
      return [];
    });
    setImportLog(() => {
      saveLS(LS_KEYS.importLog, []);
      return [];
    });
  }

  const value: DataContextValue = {
    loading,
    error,
    customers,
    rawTransactions: allTransactionsRaw,
    productStats,
    campaigns,
    addCampaign,
    updateCampaignStatus,
    importLog,
    importCsvFile,
    removeImport,
    clearAllImports,
    segmentCounts,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
