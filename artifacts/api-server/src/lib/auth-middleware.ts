import { type Request, type Response, type NextFunction } from "express";
import type { User } from "@workspace/db";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}

export function requireStaff(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const user = req.user as User;
  if (user.role !== "staff" && user.role !== "owner") {
    res.status(403).json({ error: "Forbidden: staff or owner role required" });
    return;
  }
  next();
}

export function requireOwner(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const user = req.user as User;
  if (user.role !== "owner") {
    res.status(403).json({ error: "Forbidden: owner role required" });
    return;
  }
  next();
}

/** Returns true if the request is from a staff or owner user */
export function isAdmin(req: Request): boolean {
  if (!req.isAuthenticated()) return false;
  const user = req.user as User;
  return user.role === "staff" || user.role === "owner";
}
