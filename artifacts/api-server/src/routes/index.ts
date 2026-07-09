import { Router, type IRouter } from "express";
import healthRouter from "./health";
import proxyRouter from "./proxy";
import dbRoutes from "./dbRoutes";
import uploadRoutes from "./upload";
import notificationsRoutes from "./notifications";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/db", dbRoutes);
router.use("/upload", uploadRoutes);
router.use("/notifications", notificationsRoutes);
router.use(proxyRouter);

export default router;
