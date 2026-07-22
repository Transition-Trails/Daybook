import "express-session";

declare module "express-session" {
  interface SessionData {
    passport?: { user: string }; // string ID (text PK)
  }
}
