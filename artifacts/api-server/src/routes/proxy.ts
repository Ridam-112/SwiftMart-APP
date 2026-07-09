import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// The SwiftMart production backend's CORS policy only allows a small
// whitelist of origins (its own domain, localhost, capacitor://localhost)
// and returns a 500 for any other Origin header instead of just blocking
// the request. That breaks browser-based testing from this workspace's
// preview domain. This route proxies requests server-to-server (no Origin
// header involved), so the browser only ever talks to our same-origin
// API server, sidestepping the upstream CORS restriction entirely.
const UPSTREAM = "https://swiftmart.space/api";

router.all(/^\/proxy\/(.*)/, async (req, res) => {
  const suffix = req.params[0] ?? "";
  const queryIndex = req.originalUrl.indexOf("?");
  const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : "";
  const url = `${UPSTREAM}/${suffix}${query}`;

  const headers: Record<string, string> = { accept: "application/json" };
  if (req.headers["content-type"]) {
    headers["content-type"] = req.headers["content-type"] as string;
  }
  if (req.headers["authorization"]) {
    headers["authorization"] = req.headers["authorization"] as string;
  }

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
