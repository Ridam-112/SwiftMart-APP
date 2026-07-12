/**
 * orderCleanup.ts — shared utility for cancelling an order and reversing all associated
 * financials (stock, payout, coupon). Used by the background cleanup job (C5) and the
 * Razorpay webhook payment.failed handler (M6).
 */
import { db, orders, products, coupons, payouts } from "@workspace/db";
import { eq, and, lt, ne, isNull, sql } from "drizzle-orm";
import { createNotificationLimited } from "./notification.js";

type OrderItem = { productId: string; qty: number };

/**
 * Cancel an order (if not already terminal) and reverse all associated financials.
 * Safe to call multiple times — idempotent due to terminal state guard.
 */
export async function cancelOrderAndRestoreStock(orderId: string, reason: string): Promise<void> {
  const [current] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!current) return;
  if (current.status === "cancelled" || current.status === "refunded") return;

  // Wrap all DB mutations in a transaction so a mid-way crash cannot leave partial state
  // (e.g. order cancelled but stock not restored, or payout not cancelled)
  await db.transaction(async (tx) => {
    await tx.update(orders)
      .set({ status: "cancelled", cancelReason: reason, paymentStatus: "failed" })
      .where(eq(orders.id, orderId));

    if (Array.isArray(current.items) && current.items.length > 0) {
      await Promise.all((current.items as OrderItem[]).map(async item => {
        const [updated] = await tx.update(products)
          .set({ stock: sql`${products.stock} + ${item.qty}` })
          .where(eq(products.id, item.productId))
          .returning({ stock: products.stock, status: products.status });
        if (updated && updated.stock > 0 && updated.status === "out_of_stock") {
          await tx.update(products).set({ status: "active" }).where(eq(products.id, item.productId));
        }
      }));
    }

    await tx.update(payouts)
      .set({ status: "cancelled" })
      .where(sql`${payouts.ordersIncluded} @> ${JSON.stringify([orderId])}::jsonb`);

    if (current.couponCode) {
      await tx.update(coupons)
        .set({ usedCount: sql`GREATEST(${coupons.usedCount} - 1, 0)` })
        .where(eq(coupons.code, current.couponCode));
    }
  });

  // Notification is a side effect — runs outside the transaction (non-fatal)
  if (current.customerId) {
    await createNotificationLimited(current.customerId, {
      type: "order_update",
      title: "Order Cancelled",
      message: reason.toLowerCase().includes("payment")
        ? `Your order #${orderId.slice(-6).toUpperCase()} was cancelled because payment was not completed. If you were charged, please contact support.`
        : `Your order #${orderId.slice(-6).toUpperCase()} has been cancelled.`,
      data: { orderId },
    }).catch(() => {});
  }
}

/**
 * Auto-cancel is disabled — the platform uses Cash on Delivery only.
 * Orders must only ever be cancelled by the customer or an admin.
 * Returns 0 (nothing cancelled).
 */
export async function cleanupAbandonedOrders(): Promise<number> {
  return 0;
}
