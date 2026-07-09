import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger";

const UPSTREAM = "https://swiftmart.space/api";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: string; // 'customer' | 'vendor' | 'rider'
    }
  }
}

/**
 * Requires a valid bearer token. Validates by calling the upstream
 * SwiftMart API, then attaches userId + userRole to the request.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }

  try {
    const upstreamRes = await fetch(`${UPSTREAM}/users/me/profile`, {
      headers: { authorization: authHeader as string, accept: "application/json" },
    });
    if (!upstreamRes.ok) {
      res.status(401).json({ success: false, message: "Invalid or expired session" });
      return;
    }
    const body = (await upstreamRes.json().catch(() => ({}))) as Record<string, unknown>;
    const user = (body.user ?? body.data ?? body) as Record<string, unknown>;
    const userId = (user?._id ?? user?.id) as string | undefined;
    if (!userId) {
      res.status(401).json({ success: false, message: "Could not resolve user identity" });
      return;
    }
    req.userId   = String(userId);
    req.userRole = typeof user?.role === "string" ? user.role : undefined;
    next();
  } catch (err) {
    logger.error({ err }, "Auth verification failed");
    res.status(502).json({ success: false, message: "Unable to verify session" });
  }
}
