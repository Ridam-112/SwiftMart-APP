import { pgTable, text, timestamp, boolean, doublePrecision, integer, jsonb, index } from "drizzle-orm/pg-core";
import { users } from "./users";

export const shops = pgTable("shops", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  shopName: text("shop_name").notNull(),
  ownerName: text("owner_name").notNull().default(""),
  phone: text("phone").notNull(),
  ownerId: text("owner_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  address: jsonb("address").notNull().default({}),
  shopType: text("shop_type"),
  category: text("category"),
  subcategory: text("subcategory"),
  description: text("description"),
  image: text("image"),
  banner: text("banner"),
  timings: jsonb("timings").default({}),
  commissionRate: doublePrecision("commission_rate").default(5),
  status: text("status").notNull().default("pending"),
  isOpen: boolean("is_open").notNull().default(false),
  rating: doublePrecision("rating").default(0),
  totalOrders: integer("total_orders").default(0),
  totalRevenue: doublePrecision("total_revenue").default(0),
  panNumber: text("pan_number"),
  gstNumber: text("gst_number"),
  bankAccountHolderName: text("bank_account_holder_name"),
  bankAccountNumber: text("bank_account_number"),
  bankIfscCode: text("bank_ifsc_code"),
  upiId: text("upi_id"),
  rejectionReason: text("rejection_reason"),
  certificateType: text("certificate_type"),
  certificateNumber: text("certificate_number"),
  certificateExpiryDate: text("certificate_expiry_date"),
  certificateFile: text("certificate_file"),
  certificateStatus: text("certificate_status"),
  certificateRejectReason: text("certificate_reject_reason"),
  verificationStatus: text("verification_status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("shops_owner_id_idx").on(t.ownerId),
  index("shops_status_idx").on(t.status),
  index("shops_shop_type_idx").on(t.shopType),
]);

export type Shop = typeof shops.$inferSelect;
export type InsertShop = typeof shops.$inferInsert;
