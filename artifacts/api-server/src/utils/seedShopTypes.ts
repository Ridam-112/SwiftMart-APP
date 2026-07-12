import { db, shopTypes } from "@workspace/db";
import { count } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const DEFAULT_SHOP_TYPES = [
  "Grocery", "Restaurant", "Cloud Kitchen", "Pharmacy", "Bakery", "Sweet Shop", "Fast Food",
  "Fruits & Vegetables", "Meat Shop", "Fish Shop", "Dairy", "Stationery", "Electronics",
  "Mobile Shop", "Computer Shop", "Fashion", "Clothing", "Footwear", "Beauty", "Cosmetics",
  "Salon", "Hardware", "Furniture", "Gift Shop", "Book Store", "Pet Shop", "Toy Shop",
  "Flower Shop", "Laundry", "Repair Service", "Home Services", "Automobile", "Sports Store",
  "Jewellery", "General Store", "Local Store", "Other",
];

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function seedShopTypes(): Promise<void> {
  const [{ cnt }] = await db.select({ cnt: count() }).from(shopTypes);
  if (Number(cnt) === 0) {
    await db.insert(shopTypes).values(
      DEFAULT_SHOP_TYPES.map((name) => ({ name, slug: toSlug(name), isActive: true }))
    );
    logger.info(`Seeded ${DEFAULT_SHOP_TYPES.length} shop types`);
  }
}
