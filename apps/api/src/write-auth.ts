import { timingSafeEqual } from "crypto";
import { Request, Response, NextFunction } from "express";

/** Header the browser sends on graph write requests (see README). */
export const GRAPH_WRITE_PASSWORD_HEADER = "x-write-password";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function requireGraphWritePassword(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const expected = process.env.GRAPH_WRITE_PASSWORD;
  if (!expected) {
    res.status(503).json({
      error: "Write not configured",
      message: "GRAPH_WRITE_PASSWORD is not set on the server",
    });
    return;
  }

  const provided = req.header(GRAPH_WRITE_PASSWORD_HEADER);
  if (!provided || !safeEqual(provided, expected)) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or missing write password",
    });
    return;
  }

  next();
}
