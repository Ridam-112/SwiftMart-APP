import jwt from "jsonwebtoken";

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(
      `${name} environment variable is required.\n` +
      `Run: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))" and add the result to Replit Secrets.`
    );
  }
  return val;
}

const ACCESS_SECRET: string = requireEnv("JWT_SECRET");
const REFRESH_SECRET: string = requireEnv("JWT_REFRESH_SECRET");
const ACCESS_EXPIRY = "15m";
const REFRESH_EXPIRY = "30d";

export interface JwtPayload {
  userId: string;
  phone: string;
  role: "customer" | "vendor" | "delivery_partner" | "admin" | "super_admin";
  tokenVersion: number;
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRY });
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, ACCESS_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, REFRESH_SECRET) as JwtPayload;
}
