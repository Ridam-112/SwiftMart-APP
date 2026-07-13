import { Router } from "express";
import authRouter from "./auth.js";
import adminRouter from "./admin.js";
import usersRouter from "./users.js";
import shopsRouter from "./shops.js";
import shopTypesRouter from "./shopTypes.js";
import categoriesRouter from "./categories.js";
import productsRouter from "./products.js";
import ordersRouter from "./orders.js";
import couponsRouter from "./coupons.js";
import commissionsRouter from "./commissions.js";
import deliveryRouter from "./delivery.js";
import payoutsRouter from "./payouts.js";
import reportsRouter from "./reports.js";
import notificationsRouter from "./notifications.js";
import uploadRouter from "./upload.js";
import heroBannersRouter from "./hero-banners.js";
import paymentsRouter from "./payments.js";
import pushRouter from "./push.js";
import fcmRouter from "./fcm.js";
import supportRouter from "./support.js";
import analyticsRouter from "./analytics.js";
import homepageSectionsRouter from "./homepage-sections.js";
import servicePincodesRouter from "./servicePincodes.js";
import proxyRouter from "./proxy.js";

const router = Router();

// Mounted at root (not under a prefix) — its own routes start with "/proxy/".
// See swiftmart-mobile/lib/api.ts: Expo web calls `${DOMAIN}/api/proxy/...`
// to sidestep swiftmart.space's CORS allowlist, which rejects this preview
// domain's Origin header.
router.use(proxyRouter);

router.use("/auth", authRouter);
router.use("/admin", adminRouter);
router.use("/users", usersRouter);
router.use("/shops", shopsRouter);
router.use("/shop-types", shopTypesRouter);
router.use("/categories", categoriesRouter);
router.use("/products", productsRouter);
router.use("/orders", ordersRouter);
router.use("/coupons", couponsRouter);
router.use("/commissions", commissionsRouter);
router.use("/delivery", deliveryRouter);
router.use("/payouts", payoutsRouter);
router.use("/reports", reportsRouter);
router.use("/notifications", notificationsRouter);
// Legacy mobile-app compatibility: the app registers/unregisters push tokens
// at /api/notifications/register-token (its original endpoint before FCM
// routes existed). Mount the FCM router's token endpoints here too so those
// calls keep working without an app update.
router.use("/notifications", fcmRouter);
router.use("/upload", uploadRouter);
router.use("/hero-banners", heroBannersRouter);
router.use("/payments", paymentsRouter);
router.use("/push", pushRouter);
router.use("/fcm", fcmRouter);
router.use("/support", supportRouter);
router.use("/admin/analytics", analyticsRouter);
router.use("/homepage-sections", homepageSectionsRouter);
router.use("/service-pincodes", servicePincodesRouter);

export default router;
