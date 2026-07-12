import { db, categories } from "@workspace/db";
import { eq, notInArray } from "drizzle-orm";
import { logger } from "../lib/logger.js";

interface CategorySeed {
  name: string;
  slug: string;
  emoji: string;
  color: string;
  subcategories: string[];
}

export const MASTER_CATEGORIES: CategorySeed[] = [
  { name: "Grocery", slug: "grocery", emoji: "🛒", color: "hsl(35, 90%, 55%)", subcategories: ["Rice", "Atta", "Dal", "Oil", "Spices", "Biscuits", "Packaged Foods", "Pulses", "Daily Needs"] },
  { name: "Vegetables", slug: "vegetables", emoji: "🥦", color: "hsl(140, 60%, 45%)", subcategories: ["Leafy Greens", "Root Vegetables", "Gourds", "Seasonal Vegetables", "Herbs"] },
  { name: "Fruits", slug: "fruits", emoji: "🍎", color: "hsl(10, 80%, 55%)", subcategories: ["Seasonal Fruits", "Tropical Fruits", "Citrus", "Berries", "Dry Fruits"] },
  { name: "Dairy & Ice Creams", slug: "dairy", emoji: "🥛", color: "hsl(200, 70%, 55%)", subcategories: ["Milk", "Curd", "Paneer", "Butter", "Cheese", "Ice Cream", "Ghee"] },
  { name: "Sweet Shop", slug: "sweet-shop", emoji: "🍬", color: "hsl(350, 80%, 60%)", subcategories: ["Rasgulla", "Gulab Jamun", "Ladoo", "Barfi", "Peda", "Mishti Doi", "Traditional Sweets"] },
  { name: "Bakery", slug: "bakery", emoji: "🍞", color: "hsl(30, 75%, 55%)", subcategories: ["Bread", "Cakes", "Pastries", "Cookies", "Muffins", "Croissants"] },
  { name: "Restaurant", slug: "restaurant", emoji: "🍽️", color: "hsl(20, 90%, 55%)", subcategories: ["Biryani", "Thali", "Chinese", "South Indian", "Tandoor", "Desserts", "Beverages"] },
  { name: "Fast Food", slug: "fast-food", emoji: "🍟", color: "hsl(15, 90%, 55%)", subcategories: ["Burgers", "Pizza", "Momos", "Rolls", "Sandwiches", "Wraps"] },
  { name: "Cloud Kitchen", slug: "cloud-kitchen", emoji: "🏠", color: "hsl(45, 90%, 50%)", subcategories: ["Home-made Food", "Tiffin Service", "Meal Box", "Snacks", "Home Bakers"] },
  { name: "Snacks", slug: "snacks", emoji: "🍿", color: "hsl(38, 90%, 52%)", subcategories: ["Namkeen", "Chips", "Biscuits", "Cookies", "Nuts", "Popcorn"] },
  { name: "Drinks", slug: "drinks", emoji: "🥤", color: "hsl(190, 75%, 50%)", subcategories: ["Cold Drinks", "Juices", "Water", "Tea & Coffee", "Energy Drinks", "Milkshakes"] },
  { name: "Medicine & Healthcare", slug: "medicine", emoji: "💊", color: "hsl(210, 80%, 55%)", subcategories: ["Medicines", "Health Supplements", "First Aid", "Baby Care", "Medical Devices", "Vitamins"] },
  { name: "Clothes & Fashion", slug: "clothing", emoji: "👗", color: "hsl(280, 60%, 60%)", subcategories: ["Men's Wear", "Women's Wear", "Kids Wear", "Ethnic Wear", "Western Wear"] },
  { name: "Fashion & Accessories", slug: "fashion", emoji: "👜", color: "hsl(270, 55%, 58%)", subcategories: ["Bags", "Jewellery", "Footwear", "Watches", "Belts", "Sunglasses"] },
  { name: "Handmade & Artisan", slug: "handmade", emoji: "🎨", color: "hsl(170, 60%, 45%)", subcategories: ["Handmade Jewellery", "Crochet", "Handicrafts", "Resin Art", "Candles", "Paintings"] },
  { name: "Books & Stationery", slug: "book-store", emoji: "📚", color: "hsl(200, 80%, 50%)", subcategories: ["School Books", "Office Supplies", "Novels", "Art Materials", "Notebooks", "Pens"] },
  { name: "Gift Shop", slug: "gift-shop", emoji: "🎁", color: "hsl(350, 80%, 60%)", subcategories: ["Gift Hampers", "Greeting Cards", "Photo Frames", "Showpieces", "Customised Gifts"] },
  { name: "Electronics & Appliances", slug: "electronics", emoji: "🔌", color: "hsl(230, 60%, 55%)", subcategories: ["Home Appliances", "Fans", "Mixers", "Irons", "Geysers", "Coolers", "Mobile Accessories"] },
];

const MASTER_SLUGS = MASTER_CATEGORIES.map(c => c.slug);

export async function seedCategories(): Promise<void> {
  // Remove any categories not in the master list
  await db.delete(categories).where(notInArray(categories.slug, MASTER_SLUGS));

  let inserted = 0;
  let updated = 0;

  for (const cat of MASTER_CATEGORIES) {
    const existing = await db.select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, cat.slug))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(categories).values({
        name: cat.name,
        slug: cat.slug,
        emoji: cat.emoji,
        color: cat.color,
        subcategories: cat.subcategories,
        isActive: true,
      });
      inserted++;
    } else {
      await db.update(categories)
        .set({ name: cat.name, emoji: cat.emoji, color: cat.color, subcategories: cat.subcategories })
        .where(eq(categories.slug, cat.slug));
      updated++;
    }
  }

  logger.info(`Categories synced: ${inserted} inserted, ${updated} updated (${MASTER_SLUGS.length} total)`);
}
