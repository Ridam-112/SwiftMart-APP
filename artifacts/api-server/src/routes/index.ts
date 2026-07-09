import { Router, type IRouter } from "express";
import healthRouter from "./health";
import proxyRouter from "./proxy";
import dbRoutes from "./dbRoutes";
import uploadRoutes from "./upload";
import notificationsRoutes from "./notifications";
import authRoutes from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/db", dbRoutes);
router.use("/upload", uploadRoutes);
router.use("/notifications", notificationsRoutes);
router.use("/auth", authRoutes);
router.use(proxyRouter);

export default router;
