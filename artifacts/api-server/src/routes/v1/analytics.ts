import { Router, type Response } from "express";
import { db, orders, users, shops } from "@workspace/db";
import { eq, sql, gte, and } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../../middlewares/auth.js";

const router = Router();
const A = requireRole("admin", "super_admin");

type Period = "daily" | "weekly" | "monthly";

function periodConfig(period: Period): { intervals: number; truncUnit: string; labelFn: (d: Date, i: number) => string; intervalMs: number; pgInterval: string; } {
  switch (period) {
    case "daily":
      return { intervals: 7, truncUnit: "day", labelFn: (d: Date, _i: number) => d.toLocaleDateString("en-US", { weekday: "short" }), intervalMs: 86400000, pgInterval: "7 days" };
    case "weekly":
      return { intervals: 4, truncUnit: "week", labelFn: (_d: Date, i: number) => `Week ${i + 1}`, intervalMs: 7 * 86400000, pgInterval: "28 days" };
    case "monthly":
      return { intervals: 6, truncUnit: "month", labelFn: (d: Date, _i: number) => d.toLocaleDateString("en-US", { month: "short" }), intervalMs: 0, pgInterval: "6 months" };
  }
}

// GET /api/admin/analytics?period=daily|weekly|monthly
router.get("/", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const rawPeriod = String(req.query["period"] ?? "daily").toLowerCase();
  const period: Period = (["daily", "weekly", "monthly"].includes(rawPeriod) ? rawPeriod : "daily") as Period;
  const cfg = periodConfig(period);

  const now = new Date();
  const since = new Date(now.getTime() - (period === "monthly" ? 183 * 86400000 : cfg.intervals * cfg.intervalMs));

  let orderRows: Awaited<ReturnType<typeof db.execute>>;
  let userRows: Awaited<ReturnType<typeof db.execute>>;
  let topProductRows: Awaited<ReturnType<typeof db.execute>>;
  let topShopRows: Awaited<ReturnType<typeof db.execute>>;

  try {
    [orderRows, userRows, topProductRows, topShopRows] = await Promise.all([
    // Revenue + orders grouped by truncated period
    db.execute(sql`
      SELECT
        DATE_TRUNC(${cfg.truncUnit}, created_at) AS bucket,
        COALESCE(SUM(net_amount), 0)::float AS revenue,
        COUNT(*)::int AS orders
      FROM orders
      WHERE created_at >= ${since}
      GROUP BY bucket
      ORDER BY bucket ASC
    `),

    // New customer signups grouped by period
    db.execute(sql`
      SELECT
        DATE_TRUNC(${cfg.truncUnit}, created_at) AS bucket,
        COUNT(*)::int AS new_users
      FROM users
      WHERE role = 'customer' AND created_at >= ${since}
      GROUP BY bucket
      ORDER BY bucket ASC
    `),

    // Top products by units sold — unnest the items JSONB array
    db.execute(sql`
      SELECT
        item->>'productName' AS name,
        COALESCE(item->>'category', 'other') AS category,
        SUM((item->>'qty')::int) AS units_sold,
        SUM((item->>'qty')::int * (item->>'price')::float) AS revenue
      FROM orders, jsonb_array_elements(items::jsonb) AS item
      WHERE created_at >= ${since}
        AND item->>'productName' IS NOT NULL
      GROUP BY name, category
      ORDER BY units_sold DESC
      LIMIT 10
    `),

    // Top shops by revenue
    db.execute(sql`
      SELECT
        shop_id,
        shop_name,
        COALESCE(SUM(net_amount), 0)::float AS total_revenue,
        COUNT(*)::int AS total_orders
      FROM orders
      WHERE created_at >= ${since}
      GROUP BY shop_id, shop_name
      ORDER BY total_revenue DESC
      LIMIT 10
    `),
  ]);

  // Build label buckets for the period
  const revMap = new Map<string, { revenue: number; orders: number }>();
  for (const row of orderRows.rows as { bucket: string; revenue: number; orders: number }[]) {
    const key = new Date(row.bucket).toISOString().slice(0, period === "daily" ? 10 : period === "weekly" ? 8 : 7);
    revMap.set(key, { revenue: Number(row.revenue), orders: Number(row.orders) });
  }
  const userMap = new Map<string, number>();
  for (const row of userRows.rows as { bucket: string; new_users: number }[]) {
    const key = new Date(row.bucket).toISOString().slice(0, period === "daily" ? 10 : period === "weekly" ? 8 : 7);
    userMap.set(key, Number(row.new_users));
  }

  // Generate the N time buckets going backwards from now
  const series: { label: string; revenue: number; orders: number; newUsers: number }[] = [];
  for (let i = cfg.intervals - 1; i >= 0; i--) {
    let d: Date;
    let key: string;
    if (period === "daily") {
      d = new Date(now); d.setDate(d.getDate() - i);
      key = d.toISOString().slice(0, 10);
    } else if (period === "weekly") {
      d = new Date(now); d.setDate(d.getDate() - i * 7);
      // ISO week-start
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff);
      key = d.toISOString().slice(0, 8);
    } else {
      d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      key = d.toISOString().slice(0, 7);
    }
    const idx = cfg.intervals - 1 - i;
    const label = period === "weekly"
      ? `Week ${idx + 1}`
      : d.toLocaleDateString("en-US", period === "daily" ? { weekday: "short" } : { month: "short" });
    const rev = revMap.get(key) ?? { revenue: 0, orders: 0 };
    series.push({ label, revenue: rev.revenue, orders: rev.orders, newUsers: userMap.get(key) ?? 0 });
  }

  const topProducts = (topProductRows.rows as { name: string; category: string; units_sold: number; revenue: number }[])
    .map(r => ({ name: r.name, category: r.category, unitsSold: Number(r.units_sold), revenue: Number(r.revenue) }));

  const topShops = (topShopRows.rows as { shop_id: string; shop_name: string; total_revenue: number; total_orders: number }[])
    .map(r => ({ shopId: r.shop_id, shopName: r.shop_name, totalRevenue: Number(r.total_revenue), totalOrders: Number(r.total_orders) }));

  res.json({ success: true, series, topProducts, topShops });
  } catch (err) {
    req.log.error({ err }, "Analytics query failed");
    res.status(500).json({ success: false, message: "Failed to load analytics data. Please try again." });
  }
});

export default router;
