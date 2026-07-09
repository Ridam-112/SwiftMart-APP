import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Restrict cross-origin access to this workspace's own preview domains — the
// /api/proxy route relays to a fixed upstream, but we still don't want it
// answering arbitrary third-party origins.
const allowedOriginPatterns = [/\.replit\.dev$/, /\.pike\.replit\.dev$/, /^http:\/\/localhost(:\d+)?$/];
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOriginPatterns.some((p) => p.test(origin))) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/api", router);

export default app;
