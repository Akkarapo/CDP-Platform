export type Segment = "Premium" | "Regular" | "New" | "Dormant";
export type ChurnRisk = "Low" | "Medium" | "High";

export interface RawCustomer {
  customer_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  gender: string;
  phone: string;
  email: string;
  birthdate: string;
  address: string;
  district: string;
  province: string;
  postal_code: string;
  register_date: string;
  member_tier: string;
  points_balance: string;
  acquisition_channel: string;
  is_active: string;
}

export interface RawTransaction {
  transaction_id: string;
  customer_id: string;
  purchase_datetime: string;
  product_id: string;
  product_name: string;
  category: string;
  quantity: string;
  unit_price: string;
  line_total: string;
  payment_method: string;
  store_branch: string;
}

export interface Customer {
  id: string;
  name: string;
  avatar: string;
  phone: string;
  email: string;
  province: string;
  registerDate: string;
  memberTier: string;
  isActive: boolean;
  segment: Segment;
  totalSpend: number;
  orderCount: number;
  lastPurchaseDate: Date | null;
  lastPurchaseLabel: string;
  rfm: { recency: number; frequency: number; monetary: number };
  churnRisk: ChurnRisk;
  purchaseHistory: { month: string; amount: number }[];
  recommendations: { name: string; reason: string }[];
  transactions: RawTransaction[];
}

export interface CampaignRecord {
  id: string;
  name: string;
  targetSegment: Segment | "ทุก Segment";
  status: "pending" | "approved" | "sent";
  message: string;
  createdAt: string;
}

export interface ImportLogEntry {
  id: string;
  date: string;
  channel: string;
  rows: number;
  status: "success" | "error";
  note?: string;
  fileName?: string;
  // IDs this import added, so it can be undone precisely. Absent on imports
  // logged before this field existed.
  customerIds?: string[];
  transactionIds?: string[];
}
