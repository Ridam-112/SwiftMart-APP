import { Router } from "express";
import { neonPool } from "../lib/neonDb";
import { logger } from "../lib/logger";

const router = Router();

/**
 * GET /api/db/hero-banners
 * Returns all active hero banners ordered by display_order.
 * The mobile app fetches this so the banner auto-updates whenever
 * the website admin changes it.
 */
router.get("/hero-banners", async (_req, res) => {
  if (!neonPool) { res.status(503).json({ success: false, message: "NEON_DATABASE_URL not configured" }); return; }
  try {
    const { rows } = await neonPool.query(
      `SELECT id, image_url, title, subtitle, button_text,
              redirect_type, redirect_value, display_order
       FROM hero_banners
       WHERE is_active = true
       ORDER BY display_order ASC`,
    );
    res.json({ success: true, banners: rows });
  } catch (err) {
    logger.error({ err }, "Failed to fetch hero banners");
    res.status(500).json({ success: false, message: "Failed to fetch hero banners" });
  }
});

/**
 * GET /api/db/homepage-sections
 * Returns enabled homepage sections ordered by sort_order.
 */
router.get("/homepage-sections", async (_req, res) => {
  if (!neonPool) { res.status(503).json({ success: false, message: "NEON_DATABASE_URL not configured" }); return; }
  try {
    const { rows } = await neonPool.query(
      `SELECT id, title, type, enabled, sort_order, config
       FROM homepage_sections
       WHERE enabled = true
       ORDER BY sort_order ASC`,
    );
    res.json({ success: true, sections: rows });
  } catch (err) {
    logger.error({ err }, "Failed to fetch homepage sections");
    res.status(500).json({ success: false, message: "Failed to fetch homepage sections" });
  }
});

/**
 * GET /api/db/categories
 * Returns categories directly from Neon (stays in sync with website).
 */
router.get("/categories", async (_req, res) => {
  if (!neonPool) { res.status(503).json({ success: false, message: "NEON_DATABASE_URL not configured" }); return; }
  try {
    const { rows } = await neonPool.query(
      `SELECT id, name, slug, emoji, color, is_active
       FROM categories
       WHERE is_active = true
       ORDER BY name ASC`,
    );
    res.json({ success: true, categories: rows });
  } catch (err) {
    logger.error({ err }, "Failed to fetch categories");
    res.status(500).json({ success: false, message: "Failed to fetch categories" });
  }
});

export default router;
