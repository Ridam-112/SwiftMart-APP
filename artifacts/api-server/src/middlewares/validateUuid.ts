import { type Request, type Response, type NextFunction } from "express";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateUuidParams(...params: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    for (const param of params) {
      const raw = req.params[param] as string | string[] | undefined;
      const val = Array.isArray(raw) ? raw[0] : raw;
      if (val !== undefined && !UUID_RE.test(val)) {
        res.status(400).json({ success: false, message: `Invalid ${param}: must be a valid UUID` });
        return;
      }
    }
    next();
  };
}
