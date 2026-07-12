import { db, commissionRules, categories, shopTypes } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface ResolvedCommission {
  rate: number;
  type: "percentage" | "fixed";
  level: string;
}

export async function resolveCommission(opts: {
  productId?: string;
  vendorId?: string;
  categorySlug?: string;
  shopTypeSlug?: string;
}): Promise<ResolvedCommission> {
  const rules = await db.select().from(commissionRules).where(eq(commissionRules.isActive, true));

  const find = (level: string, targetId?: string) =>
    rules.find((r) => r.level === level && (!targetId || r.targetId === targetId));

  if (opts.productId) {
    const r = find("product", opts.productId);
    if (r) return { rate: r.rate, type: (r.type ?? "percentage") as "percentage" | "fixed", level: "product" };
  }
  if (opts.vendorId) {
    const r = find("vendor", opts.vendorId);
    if (r) return { rate: r.rate, type: (r.type ?? "percentage") as "percentage" | "fixed", level: "vendor" };
  }
  if (opts.categorySlug) {
    const r = find("category", opts.categorySlug);
    if (r) return { rate: r.rate, type: (r.type ?? "percentage") as "percentage" | "fixed", level: "category" };
    // Fall back to the commissionRate stored directly on the category row (L8)
    const [cat] = await db.select({ commissionRate: categories.commissionRate })
      .from(categories).where(eq(categories.slug, opts.categorySlug)).limit(1);
    if (cat?.commissionRate != null) {
      return { rate: cat.commissionRate, type: "percentage", level: "category" };
    }
  }
  if (opts.shopTypeSlug) {
    const r = find("shop_type", opts.shopTypeSlug);
    if (r) return { rate: r.rate, type: (r.type ?? "percentage") as "percentage" | "fixed", level: "shop_type" };
    // Fall back to the commissionRate stored directly on the shop type row (L8)
    const [st] = await db.select({ commissionRate: shopTypes.commissionRate })
      .from(shopTypes).where(eq(shopTypes.slug, opts.shopTypeSlug)).limit(1);
    if (st?.commissionRate != null) {
      return { rate: st.commissionRate, type: "percentage", level: "shop_type" };
    }
  }
  const global = find("global");
  if (global) return { rate: global.rate, type: (global.type ?? "percentage") as "percentage" | "fixed", level: "global" };
  return { rate: 5, type: "percentage", level: "default" };
}

export function calculateCommissionAmount(netAmount: number, resolved: ResolvedCommission): number {
  if (resolved.type === "fixed") {
    return +Math.min(resolved.rate, netAmount).toFixed(2);
  }
  return +(netAmount * resolved.rate / 100).toFixed(2);
}

export async function resolveCommissionRate(opts: {
  productId?: string;
  vendorId?: string;
  categorySlug?: string;
  shopTypeSlug?: string;
}): Promise<number> {
  const r = await resolveCommission(opts);
  return r.rate;
}
