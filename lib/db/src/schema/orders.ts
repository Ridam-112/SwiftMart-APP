import { pgTable, text, timestamp, doublePrecision, jsonb, index } from "drizzle-orm/pg-core";

export const orders = pgTable("orders", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  customerId: text("customer_id").notNull(),
  customerName: text("customer_name").notNull().default(""),
  customerPhone: text("customer_phone").notNull().default(""),
  shopId: text("shop_id").notNull(),
  shopName: text("shop_name").notNull().default(""),
  items: jsonb("items").notNull().default([]),
  subtotal: doublePrecision("subtotal").notNull().default(0),
  deliveryCharge: doublePrecision("delivery_charge").notNull().default(0),
  couponDiscount: doublePrecision("coupon_discount").notNull().default(0),
  netAmount: doublePrecision("net_amount").notNull().default(0),
  commissionRate: doublePrecision("commission_rate").notNull().default(0),
  commissionAmount: doublePrecision("commission_amount").notNull().default(0),
  vendorPayable: doublePrecision("vendor_payable").notNull().default(0),
  platformRevenue: doublePrecision("platform_revenue").notNull().default(0),
  status: text("status").notNull().default("placed"),
  paymentMethod: text("payment_method").notNull().default("COD"),
  paymentStatus: text("payment_status").notNull().default("pending"),
  deliveryType: text("delivery_type").notNull().default("instant"),
  deliveryPartnerId: text("delivery_partner_id"),
  address: jsonb("address").notNull().default({}),
  couponCode: text("coupon_code"),
  razorpayOrderId: text("razorpay_order_id"),
  razorpayPaymentId: text("razorpay_payment_id"),
  refundedAt: timestamp("refunded_at"),
  cancelReason: text("cancel_reason"),
  deliveryOtp: text("delivery_otp"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("orders_customer_id_idx").on(t.customerId),
  index("orders_shop_id_idx").on(t.shopId),
  index("orders_status_idx").on(t.status),
  index("orders_payment_status_idx").on(t.paymentStatus),
  index("orders_created_at_idx").on(t.createdAt),
]);

export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;
