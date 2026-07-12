import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, type JwtPayload } from "../lib/jwt.js";
import { db, users } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "Authorization token required" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = verifyAccessToken(token);

    // Revocation check: compare tokenVersion against DB.
    // Logout increments the DB version, instantly invalidating all issued tokens.
    const [user] = await db.select({ tokenVersion: users.tokenVersion, status: users.status })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (!user) {
      res.status(401).json({ success: false, message: "User not found" });
      return;
    }
    if (user.status !== "active") {
      res.status(401).json({ success: false, message: "Account is suspended" });
      return;
    }
    if ((user.tokenVersion ?? 1) !== (payload.tokenVersion ?? 1)) {
      res.status(401).json({ success: false, message: "Session has been revoked. Please log in again." });
      return;
    }

    req.user = payload;
    next();
  } catch {
    res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

export function requireRole(...roles: JwtPayload["role"][]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, message: "Forbidden: insufficient role" });
      return;
    }
    next();
  };
}

export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    try {
      req.user = verifyAccessToken(authHeader.slice(7));
    } catch {
      // ignore
    }
  }
  next();
}
