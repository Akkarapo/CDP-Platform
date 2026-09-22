import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fetchCsv, parseCsv } from "./csv";
import { buildCustomers, buildProductStats } from "./analytics";
import { MOCK_POS_KEY, MOCK_POS_ENDPOINT, MOCK_POS_TX_PREFIX, MOCK_POS_CUSTOMER_PREFIX, POS_TICK_MS, generatePosTick } from "./posSimulator";
import type { RawCustomer, RawTransaction, Customer, CampaignRecord, ImportLogEntry } from "./types";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 182;

const LS_KEYS = {
  extraCustomers: "cdp.extraCustomers",
  extraTransactions: "cdp.extraTransactions",
  importLog: "cdp.importLog",
  pointsOverrides: "cdp.pointsOverrides",
  posConnected: "cdp.posConnected",
};

interface PointsSnapshot { points: number; asOf: string }

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
        // Some exports (e.g. a "new customers" feed) omit tier/points/active
        // columns entirely since a brand-new member hasn't accrued any yet.
        member_tier: r.member_tier || "Bronze",
        points_balance: r.points_balance || "0",
        acquisition_channel: r.acquisition_channel,
        is_active: r.is_active || "TRUE",
      });
    }
  }
  return { customers, transactions };
}

// POS exports carry a running points_balance snapshot on every row for a
// member; the highest event_datetime in the file is that customer's current
// balance as of this import.
function latestPointsFromRows(rows: Record<string, string>[]): Map<string, PointsSnapshot> {
  const map = new Map<string, PointsSnapshot>();
  for (const r of rows) {
    if (!r.customer_id || !r.points_balance) continue;
    const points = Number(r.points_balance);
    if (Number.isNaN(points)) continue;
    const asOf = r.event_datetime || "";
    const existing = map.get(r.customer_id);
    if (!existing || asOf >= existing.asOf) map.set(r.customer_id, { points, asOf });
  }
  return map;
}

interface DataContextValue {
  loading: boolean;
  error: string | null;
  customers: Customer[];
  rawCustomers: RawCustomer[];
  rawTransactions: RawTransaction[];
  productStats: ReturnType<typeof buildProductStats>;
  campaigns: CampaignRecord[];
  addCampaign: (c: Omit<CampaignRecord, "createdAt">) => Promise<void>;
  updateCampaignStatus: (id: string, status: CampaignRecord["status"]) => Promise<void>;
  sendCampaign: (id: string) => Promise<number>;
  importLog: ImportLogEntry[];
  importCsvFile: (fileName: string, text: string) => { ok: boolean; message: string; preview: Record<string, string>[] };
  removeImport: (id: string) => void;
  clearAllImports: () => void;
  posConnected: boolean;
  connectPos: (key: string, endpoint: string) => boolean;
  resetPos: () => void;
}

// Re-exported so callers (Settings' connect-form hint, etc.) don't need to
// import from posSimulator directly.
export { MOCK_POS_KEY, MOCK_POS_ENDPOINT, MOCK_POS_TX_PREFIX, MOCK_POS_CUSTOMER_PREFIX };

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [baseCustomers, setBaseCustomers] = useState<RawCustomer[]>([]);
  const [baseTransactions, setBaseTransactions] = useState<RawTransaction[]>([]);
  const [extraCustomers, setExtraCustomers] = useState<RawCustomer[]>(() => loadLS(LS_KEYS.extraCustomers, []));
  const [extraTransactions, setExtraTransactions] = useState<RawTransaction[]>(() => loadLS(LS_KEYS.extraTransactions, []));
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [importLog, setImportLog] = useState<ImportLogEntry[]>(() => loadLS(LS_KEYS.importLog, []));
  // Points balances that later imports overwrote for customers already on
  // file (base or extra) — applied on top of their record's points_balance.
  const [pointsOverrides, setPointsOverrides] = useState<Record<string, PointsSnapshot>>(() => loadLS(LS_KEYS.pointsOverrides, {}));

  useEffect(() => {
    Promise.all([fetchCsv("/data/customers.csv"), fetchCsv("/data/transactions.csv")])
      .then(([c, t]) => {
        setBaseCustomers(c as unknown as RawCustomer[]);
        setBaseTransactions(t as unknown as RawTransaction[]);
      })
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) {
      setCampaigns([]);
      return;
    }

    let active = true;

    supabase
      .from("campaigns")
      .select("id,name,target_segment,status,message,created_at,image_url")
      .order("created_at", { ascending: false })
      .then(({ data, error: campaignError }) => {
        if (!active) return;
        if (campaignError) {
          setError(campaignError.message);
          return;
        }
        setCampaigns((data ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          targetSegment: row.target_segment as CampaignRecord["targetSegment"],
          status: row.status as CampaignRecord["status"],
          message: row.message,
          createdAt: row.created_at,
          imageUrl: row.image_url ?? undefined,
        })));
      });

    return () => {
      active = false;
    };
  }, [user]);

  const allCustomersRaw = useMemo(() => {
    const merged = [...baseCustomers, ...extraCustomers];
    if (Object.keys(pointsOverrides).length === 0) return merged;
    return merged.map((c) => {
      const override = pointsOverrides[c.customer_id];
      return override ? { ...c, points_balance: String(override.points) } : c;
    });
  }, [baseCustomers, extraCustomers, pointsOverrides]);
  const allTransactionsRaw = useMemo(() => [...baseTransactions, ...extraTransactions], [baseTransactions, extraTransactions]);

  const customers = useMemo(
    () => buildCustomers(allCustomersRaw, allTransactionsRaw, campaigns),
    [allCustomersRaw, allTransactionsRaw, campaigns]
  );
  const productStats = useMemo(() => buildProductStats(allTransactionsRaw), [allTransactionsRaw]);

  // POS API simulator — lives here (not on the Settings page) so it keeps
  // ticking no matter which route is mounted, and every page sees new mock
  // transactions/customers show up live.
  const [posConnected, setPosConnected] = useState(() => loadLS(LS_KEYS.posConnected, false));
  const simRef = useRef({ customers, allCustomersRaw, allTransactionsRaw });
  simRef.current = { customers, allCustomersRaw, allTransactionsRaw };

  useEffect(() => {
    if (!posConnected) return;
    const interval = setInterval(() => {
      const { customers: cs, allCustomersRaw: acr, allTransactionsRaw: atr } = simRef.current;
      const result = generatePosTick(cs, acr, atr);
      if (!result) return;
      if (result.customer) {
        setExtraCustomers((prev) => {
          const next = [...prev, result.customer!];
          saveLS(LS_KEYS.extraCustomers, next);
          return next;
        });
      }
      setExtraTransactions((prev) => {
        const next = [...prev, result.transaction];
        saveLS(LS_KEYS.extraTransactions, next);
        return next;
      });
    }, POS_TICK_MS);
    return () => clearInterval(interval);
  }, [posConnected]);

  function connectPos(key: string, endpoint: string): boolean {
    if (key.trim() !== MOCK_POS_KEY || endpoint.trim() !== MOCK_POS_ENDPOINT) return false;
    localStorage.setItem("cdp.posKey", key);
    localStorage.setItem("cdp.posEndpoint", endpoint);
    saveLS(LS_KEYS.posConnected, true);
    setPosConnected(true);
    return true;
  }

  function resetPos() {
    setPosConnected(false);
    saveLS(LS_KEYS.posConnected, false);
    localStorage.removeItem("cdp.posKey");
    localStorage.removeItem("cdp.posEndpoint");
    setExtraTransactions((prev) => {
      const next = prev.filter((t) => !t.transaction_id.startsWith(MOCK_POS_TX_PREFIX));
      saveLS(LS_KEYS.extraTransactions, next);
      return next;
    });
    setExtraCustomers((prev) => {
      const next = prev.filter((c) => !c.customer_id.startsWith(MOCK_POS_CUSTOMER_PREFIX));
      saveLS(LS_KEYS.extraCustomers, next);
      return next;
    });
  }

  async function addCampaign(c: Omit<CampaignRecord, "createdAt">) {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) throw authError ?? new Error("กรุณาเข้าสู่ระบบอีกครั้ง");

    const { data, error: campaignError } = await supabase
      .from("campaigns")
      .insert({
        id: c.id,
        name: c.name,
        target_segment: c.targetSegment,
        status: c.status,
        message: c.message,
        image_url: c.imageUrl ?? null,
        created_by: authData.user.id,
      })
      .select("id,name,target_segment,status,message,created_at,image_url")
      .single();

    if (campaignError) throw campaignError;
    setCampaigns((prev) => [{
      id: data.id,
      name: data.name,
      targetSegment: data.target_segment as CampaignRecord["targetSegment"],
      status: data.status as CampaignRecord["status"],
      message: data.message,
      createdAt: data.created_at,
      imageUrl: data.image_url ?? undefined,
    }, ...prev]);
  }
  async function updateCampaignStatus(id: string, status: CampaignRecord["status"]) {
    const { error: campaignError } = await supabase
      .from("campaigns")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (campaignError) throw campaignError;
    setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
  }
  async function sendCampaign(id: string): Promise<number> {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("กรุณาเข้าสู่ระบบอีกครั้ง");

    const res = await fetch("/api/campaign-send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ campaignId: id }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "ส่งแคมเปญไม่สำเร็จ");
    setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, status: "sent" } : c)));
    return data.recipientCount as number;
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
    const existingTransactionIds = new Set(allTransactionsRaw.map((t) => t.transaction_id));
    let entry: ImportLogEntry;
    if (isEventLog) {
      const existingCustomerIds = new Set(allCustomersRaw.map((c) => c.customer_id));
      const { customers: newCustomers, transactions: allNewTransactions } = splitEventLog(rows, existingCustomerIds);
      // Re-uploading a file (e.g. after retrying a failed import) must not
      // double-count transactions already in the system.
      const newTransactions = allNewTransactions.filter((t) => !existingTransactionIds.has(t.transaction_id));

      // Reconcile points_balance against this file's most recent snapshot
      // per customer — for brand-new members that's just their starting
      // balance; for customers already on file it's an update to apply on
      // top of their existing record.
      const latestPoints = latestPointsFromRows(rows);
      const newCustomerIds = new Set(newCustomers.map((c) => c.customer_id));
      for (const c of newCustomers) {
        const latest = latestPoints.get(c.customer_id);
        if (latest) c.points_balance = String(latest.points);
      }
      const pointsChanges: Record<string, PointsSnapshot | null> = {};
      const overrideUpdates: Record<string, PointsSnapshot> = {};
      for (const [customerId, latest] of latestPoints) {
        if (newCustomerIds.has(customerId)) continue;
        const current = pointsOverrides[customerId];
        if (current && current.asOf >= latest.asOf) continue;
        pointsChanges[customerId] = current ?? null;
        overrideUpdates[customerId] = latest;
      }

      if (Object.keys(overrideUpdates).length > 0) {
        setPointsOverrides((prev) => {
          const next = { ...prev, ...overrideUpdates };
          saveLS(LS_KEYS.pointsOverrides, next);
          return next;
        });
      }
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
        pointsChanges: Object.keys(pointsChanges).length > 0 ? pointsChanges : undefined,
      };
      setImportLog((prev) => {
        const next = [entry, ...prev];
        saveLS(LS_KEYS.importLog, next);
        return next;
      });
      const updatedPoints = Object.keys(overrideUpdates).length;
      return {
        ok: true,
        message: `นำเข้าแล้ว ${newCustomers.length} ลูกค้าใหม่, ${newTransactions.length} ธุรกรรม`
          + (updatedPoints > 0 ? ` และอัปเดตแต้มสะสม ${updatedPoints} ราย` : "")
          + ` จากไฟล์ "${fileName}"`,
        preview: rows.slice(0, 5),
      };
    } else if (isTransactions) {
      const newTransactions = (rows as unknown as RawTransaction[]).filter(
        (t) => !existingTransactionIds.has(t.transaction_id)
      );
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
      setImportLog((prev) => {
        const next = [entry, ...prev];
        saveLS(LS_KEYS.importLog, next);
        return next;
      });
      const skipped = rows.length - newTransactions.length;
      return {
        ok: true,
        message: skipped > 0
          ? `นำเข้าแล้ว ${newTransactions.length} ธุรกรรม (ข้าม ${skipped} รายการที่มีอยู่แล้ว) จากไฟล์ "${fileName}"`
          : `นำเข้าแล้ว ${newTransactions.length} ธุรกรรมจากไฟล์ "${fileName}"`,
        preview: rows.slice(0, 5),
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
    if (target.pointsChanges) {
      setPointsOverrides((prev) => {
        const next = { ...prev };
        for (const [customerId, prior] of Object.entries(target.pointsChanges!)) {
          if (prior) next[customerId] = prior;
          else delete next[customerId];
        }
        saveLS(LS_KEYS.pointsOverrides, next);
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
    setPointsOverrides(() => {
      saveLS(LS_KEYS.pointsOverrides, {});
      return {};
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
    rawCustomers: allCustomersRaw,
    rawTransactions: allTransactionsRaw,
    productStats,
    campaigns,
    addCampaign,
    updateCampaignStatus,
    sendCampaign,
    importLog,
    importCsvFile,
    removeImport,
    clearAllImports,
    posConnected,
    connectPos,
    resetPos,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}

// Customer history isn't stored anywhere, so "6 months ago" is reconstructed
// by re-running the same RFM/segmentation logic against the customer roster
// and transactions as they stood as of that cutoff date.
export function usePastCustomer(customerId: string): Customer | null {
  const { rawCustomers, rawTransactions } = useData();
  return useMemo(() => {
    const cutoff = new Date(Date.now() - SIX_MONTHS_MS);
    const pastRoster = rawCustomers.filter((c) => new Date(c.register_date) <= cutoff);
    if (!pastRoster.some((c) => c.customer_id === customerId)) return null;
    const pastTransactions = rawTransactions.filter((t) => new Date(t.purchase_datetime) <= cutoff);
    const built = buildCustomers(pastRoster, pastTransactions, [], cutoff);
    return built.find((c) => c.id === customerId) ?? null;
  }, [customerId, rawCustomers, rawTransactions]);
}
