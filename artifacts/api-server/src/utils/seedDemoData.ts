import { db, shops, products, users } from "@workspace/db";
import { eq, inArray, or, like } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const DEMO_PHONES = ["9000000001", "9000000002", "9000000003"];
const DEMO_PAN_PREFIX = "DEMO";

export async function clearDemoData(): Promise<void> {
  const demoShops = await db
    .select({ id: shops.id })
    .from(shops)
    .where(
      or(
        inArray(shops.phone, DEMO_PHONES),
        like(shops.panNumber, `${DEMO_PAN_PREFIX}%`)
      )
    );

  if (demoShops.length === 0) {
    logger.info("clearDemoData: no demo data found — already clean");
    return;
  }

  const demoShopIds = demoShops.map((s) => s.id);

  const [productsResult, shopsResult, usersResult] = await Promise.all([
    db.delete(products).where(inArray(products.shopId, demoShopIds)),
    db.delete(shops).where(inArray(shops.id, demoShopIds)),
    db.delete(users).where(inArray(users.phone, DEMO_PHONES)),
  ]);

  logger.info(
    {
      shops: (shopsResult as unknown as { rowCount?: number }).rowCount ?? 0,
      products: (productsResult as unknown as { rowCount?: number }).rowCount ?? 0,
      users: (usersResult as unknown as { rowCount?: number }).rowCount ?? 0,
    },
    "clearDemoData: demo data purged"
  );
}
