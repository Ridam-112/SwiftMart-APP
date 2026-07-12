import express, { type Express, type Request, type Response, type NextFunction } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { globalApiLimiter } from "./middlewares/rateLimiter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// Security headers — applied before CORS so headers are always present.
// The server also serves the React SPA static assets, so the CSP must
// allow scripts, styles, fonts, and third-party resources used by the frontend.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc:    ["'self'"],
      scriptSrc:     ["'self'", "'unsafe-inline'", "https://checkout.razorpay.com", "https://www.gstatic.com", "https://apis.google.com"],
      styleSrc:      ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:       ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc:        ["'self'", "data:", "blob:", "https:"],
      connectSrc:    ["'self'", "https:", "wss:", "https://www.googleapis.com", "https://firebaseinstallations.googleapis.com", "https://fcmregistrations.googleapis.com"],
      manifestSrc:   ["'self'"],
      workerSrc:     ["'self'", "blob:"],
      frameAncestors:["'none'"],
      formAction:    ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ─── CORS ────────────────────────────────────────────────────────────────────
// We implement CORS manually (instead of the `cors` package) so that the
// origin callback has access to `req.headers` for the same-origin check.
//
// Allowed origins (in production):
//   1. No Origin header  — server-to-server / curl, always OK
//   2. Capacitor WebView — https://localhost or capacitor://localhost (APK)
//   3. Same-origin       — the request's Origin matches this server's own host
//                          (browser fetch from the deployed .replit.app page)
//   4. ALLOWED_ORIGINS   — explicit comma-separated override env var
//
// In development every origin is allowed (avoids Replit proxy IP confusion).
// ─────────────────────────────────────────────────────────────────────────────
const configuredOrigins = (process.env["ALLOWED_ORIGINS"] ?? "")
  .split(",").map(o => o.trim()).filter(Boolean);

const CAPACITOR_ORIGINS = new Set([
  "https://localhost",
  "capacitor://localhost",
  "http://localhost",
]);

const isProd = process.env["NODE_ENV"] === "production";

app.use((req: Request, res: Response, next: NextFunction): void => {
  const origin = req.headers.origin as string | undefined;

  const resolveAllowed = (): string | null => {
    // No Origin header → not a browser cross-origin request; allow
    if (!origin) return "*";
    // Dev → allow everything
    if (!isProd) return origin;
    // Capacitor APK WebView
    if (CAPACITOR_ORIGINS.has(origin)) return origin;
    // Same-origin: browser fetch from the page served by THIS server.
    // The Replit reverse proxy forwards x-forwarded-host / x-forwarded-proto.
    const host = ((req.headers["x-forwarded-host"] as string | undefined) ?? req.headers.host ?? "")
      .split(",")[0]?.trim() ?? "";
    const proto = ((req.headers["x-forwarded-proto"] as string | undefined) ?? "https")
      .split(",")[0]?.trim() ?? "https";
    if (host && origin === `${proto}://${host}`) return origin;
    // Explicit allowlist override
    if (configuredOrigins.includes(origin)) return origin;
    return null;
  };

  const allowed = resolveAllowed();

  if (allowed === null) {
    // Log and reject — same behaviour as before
    next(new Error(`CORS: origin '${origin}' not allowed`));
    return;
  }

  res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,Accept,X-Requested-With");
  res.setHeader("Access-Control-Max-Age", "86400");

  // Respond to preflight immediately
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
});

app.use(express.json({
  verify: (req, _res, buf) => {
    // Capture raw body for Razorpay webhook signature verification
    if ((req as Request & { url?: string }).url?.includes("/payments/webhook")) {
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
    }
  },
}));
app.use(express.urlencoded({ extended: true }));

// ─── Health check — must be before rate limiter and API router ───────────────
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ ok: true, service: "swiftmart-api" });
});

// ─── Block scanner / exploit paths ───────────────────────────────────────────
const SCANNER_RE = /^\/(\.git|\.env|\.htaccess|wp-admin|wp-includes|wp-content|xmlrpc\.php|phpmyadmin|cgi-bin|admin\.php|config\.php)/i;
app.use((req: Request, res: Response, next: NextFunction): void => {
  if (SCANNER_RE.test(req.path)) {
    res.status(404).end();
    return;
  }
  next();
});

app.use("/api/uploads", express.static(path.join(__dirname, "..", "uploads")));
app.use("/api", globalApiLimiter, router);

// In production: serve the built React frontend and handle SPA routing.
// Dotfiles and suspicious paths never receive index.html.
if (process.env.NODE_ENV === "production") {
  const frontendDist = path.join(__dirname, "..", "..", "swiftmart", "dist", "public");
  app.use(express.static(frontendDist));
  app.get("/{*splat}", (req: Request, res: Response) => {
    // Never serve SPA for dotfiles or scanner paths (already blocked above,
    // but guard here too so static middleware bypasses don't sneak through)
    if (/\/\./.test(req.path) || SCANNER_RE.test(req.path)) {
      res.status(404).end();
      return;
    }
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ success: false, message: "Internal server error" });
});

export default app;
