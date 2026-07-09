import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const UPSTREAM = "https://swiftmart.space/api";

function upstreamHeaders(req: { headers: Record<string, string | string[] | undefined> }): Record<string, string> {
  const h: Record<string, string> = { accept: "application/json" };
  if (req.headers["content-type"]) h["content-type"] = req.headers["content-type"] as string;
  if (req.headers["authorization"]) h["authorization"] = req.headers["authorization"] as string;
  return h;
}

async function fetchUpstream(path: string, headers: Record<string, string>, method = "GET", body?: string) {
  return fetch(`${UPSTREAM}/${path}`, { method, headers, body });
}

/** Fetch a shop by ID and normalize field names. Returns null on failure. */
async function fetchShop(id: string, headers: Record<string, string>): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetchUpstream(`shops/${id}`, headers);
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    const raw = (data.shop ?? data) as Record<string, unknown>;
    return { ...raw, _id: raw._id ?? raw.id, name: raw.name ?? raw.shopName };
  } catch {
    return null;
  }
}

/** Fetch a product by ID. Returns null on failure. */
async function fetchProduct(id: string, headers: Record<string, string>): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetchUpstream(`products/${id}`, headers);
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    const raw = (data.product ?? data) as Record<string, unknown>;
    return { ...raw, _id: raw._id ?? raw.id };
  } catch {
    return null;
  }
}

/**
 * GET /api/proxy/orders-enriched
 * Fetches the user's orders from upstream and enriches each order with
 * full shop and product details (by fetching them individually if needed).
 * This sidesteps the upstream API's missing populate() calls.
 */
router.get("/proxy/orders-enriched", async (req, res) => {
  const headers = upstreamHeaders(req as never);
  try {
    // 1. Fetch raw orders
    const ordersRes = await fetchUpstream("orders", headers);
    const ordersData = await ordersRes.json() as Record<string, unknown>;
    if (!ordersRes.ok) {
      res.status(ordersRes.status).json(ordersData);
      return;
    }

    type RawItem = { product?: unknown; productId?: string; price?: number; quantity?: number };
    type RawOrder = {
      _id?: string; id?: string; shop?: unknown; shopId?: string;
      items?: RawItem[]; totalAmount?: number; status?: string;
      createdAt?: string; [k: string]: unknown;
    };

    const orders: RawOrder[] = Array.isArray(ordersData)
      ? (ordersData as RawOrder[])
      : Array.isArray((ordersData as Record<string, unknown>).orders)
        ? ((ordersData as Record<string, unknown>).orders as RawOrder[])
        : [];

    // 2. Collect unique string IDs that need enrichment
    const shopIds = new Set<string>();
    const productIds = new Set<string>();

    for (const order of orders) {
      if (typeof order.shop === "string" && order.shop.length > 0) shopIds.add(order.shop);
      if (typeof order.shopId === "string" && order.shopId.length > 0) shopIds.add(order.shopId);
      for (const item of order.items ?? []) {
        if (typeof item.product === "string" && item.product.length > 0) productIds.add(item.product);
        if (typeof item.productId === "string" && item.productId.length > 0) productIds.add(item.productId);
      }
    }

    // 3. Fetch shop + product details in parallel
    const [shopEntries, productEntries] = await Promise.all([
      Promise.all(Array.from(shopIds).map(async id => [id, await fetchShop(id, headers)] as const)),
      Promise.all(Array.from(productIds).map(async id => [id, await fetchProduct(id, headers)] as const)),
    ]);

    const shopMap = Object.fromEntries(shopEntries.filter(([, v]) => v !== null));
    const productMap = Object.fromEntries(productEntries.filter(([, v]) => v !== null));

    // 4. Merge enriched data back into orders
    const enriched = orders.map(order => ({
      ...order,
      _id: order._id ?? order.id,
      shop: typeof order.shop === "string"
        ? (shopMap[order.shop] ?? order.shop)
        : order.shop != null
          ? { ...(order.shop as object), name: (order.shop as Record<string,unknown>).name ?? (order.shop as Record<string,unknown>).shopName }
          : order.shop,
      items: (order.items ?? []).map(item => ({
        ...item,
        product: typeof item.product === "string"
          ? (productMap[item.product] ?? { _id: item.product, name: "Item" })
          : item.product,
      })),
    }));

    res.json({ success: true, orders: enriched });
  } catch (err) {
    logger.error({ err }, "Failed to enrich orders");
    res.status(502).json({ success: false, message: "Failed to fetch orders" });
  }
});

// ─── Generic catch-all proxy ───────────────────────────────────────────────
router.all(/^\/proxy\/(.*)/, async (req, res) => {
  const suffix = req.params[0] ?? "";
  const queryIndex = req.originalUrl.indexOf("?");
  const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : "";
  const url = `${UPSTREAM}/${suffix}${query}`;

  const headers = upstreamHeaders(req as never);
  const hasBody = !["GET", "HEAD"].includes(req.method);

  try {
    const upstreamResponse = await fetch(url, {
      method: req.method,
      headers,
      body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
    });
    const text = await upstreamResponse.text();
    const contentType = upstreamResponse.headers.get("content-type");
    if (contentType) res.setHeader("content-type", contentType);
    res.status(upstreamResponse.status).send(text);
  } catch (err) {
    logger.error({ err, url }, "Proxy request to upstream failed");
    res.status(502).json({ success: false, message: "Upstream request failed" });
  }
});

export default router;
