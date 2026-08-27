import "express-session";
import type { StoreImpersonation } from "../lib/roles";

declare module "express-session" {
  interface SessionData {
    passport?: { user: string }; // string ID (text PK)
    storeImpersonation?: StoreImpersonation;
  }
}
