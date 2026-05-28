// Product domain
export interface SapoVariant {
  id: number;
  sku: string;
  price: string;
  inventory_item_id: number;
  weight: number;
  inventory_quantity: number;
}

export interface SapoProductImage {
  id: number;
  src: string;
  alt: string | null;
}

export interface SapoProduct {
  id: number;
  name: string;
  status: "active" | "inactive" | "draft";
  variants: SapoVariant[];
  images: SapoProductImage[];
}

// Inventory domain
export interface SapoInventoryLevel {
  inventory_item_id: number;
  location_id: number;
  available: number;
}

export interface SapoInventoryItem {
  id: number;
  sku: string;
  cost: string | null;
  tracked: boolean;
}

export interface SapoLocation {
  id: number;
  name: string;
}

// Promotions domain
export interface SapoPriceRule {
  id: number;
  title: string;
  status: string;
  discount_type: "percentage" | "fixed_amount" | "fixed_price" | "free_shipping";
  value: string;
  starts_on: string;
  ends_on: string | null;
  usage_limit: number | null;
  times_used: number;
  prerequisite_product_ids: number[];
  prerequisite_collection_ids: number[];
  entitled_product_ids: number[];
  entitled_collection_ids: number[];
  created_on: string;
  modified_on: string;
}

export interface SapoDiscountCode {
  id: number;
  price_rule_id: number;
  code: string;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

// Customer domain
export interface SapoAddress {
  id: number;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  zip: string | null;
  phone: string | null;
  name: string | null;
  default: boolean;
}

// Order domain
export interface SapoOrderAddress {
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  zip: string | null;
  phone: string | null;
}

export interface SapoFulfillment {
  id: number;
  status: string;
  tracking_number: string | null;
  tracking_company: string | null;
  created_at: string;
}

export interface SapoOrder {
  id: number;
  order_number: string;
  status: string;
  financial_status: string;
  fulfillment_status: "shipped" | "partial" | "unshipped" | null;
  total_price: string;
  customer: SapoCustomer | null;
  line_items: SapoLineItem[];
  created_on: string;
  note: string | null;
  email: string | null;
  payment_gateway: string | null;
  currency?: string;
  shipping_address?: SapoOrderAddress | null;
  billing_address?: SapoOrderAddress | null;
  fulfillments?: SapoFulfillment[];
}

export interface SapoCustomer {
  id: number;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  orders_count?: number;
  total_spent?: string;
  addresses?: SapoAddress[];
  default_address?: SapoAddress | null;
  note?: string | null;
}

export interface SapoLineItem {
  id: number;
  product_id: number;
  variant_id: number;
  name: string;
  sku: string;
  quantity: number;
  price: string;
}

// Refund domain
export interface SapoRefundLineItem {
  line_item_id: number;
  variant_id: number | null;
  title: string;
  quantity: number;
  subtotal: string;
}

export interface SapoRefundTransaction {
  id: number;
  amount: string;
  gateway: string;
  status: string;
}

export interface SapoRefund {
  id: number;
  created_at: string;
  note: string | null;
  refund_line_items: SapoRefundLineItem[];
  transactions: SapoRefundTransaction[];
}

// Transaction domain
export interface SapoTransaction {
  id: number;
  kind: "sale" | "refund" | "void" | "capture";
  status: string;
  amount: string;
  currency: string;
  gateway: string;
  created_at: string;
  error_code: string | null;
}

// Carrier service domain
export interface SapoCarrierService {
  id: number;
  name: string;
  active: boolean;
  service_discovery: boolean;
  carrier_service_type: string;
  callback_url: string | null;
  format: string | null;
}
