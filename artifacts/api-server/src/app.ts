import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import passport from "passport";
import cookieParser from "cookie-parser";
import path from "node:path";
import router from "./routes";
import { logger } from "./lib/logger";
import "./lib/passport"; // configure passport strategies

const app: Express = express();

// Trust Replit's reverse proxy — required for secure cookies and correct req.protocol
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
// Webhooks need raw body for signature verification — mount before express.json()
app.use("/api/webhooks/stripe", express.raw({ type: "application/json" }));
app.use("/api/webhooks/resend", express.raw({ type: "application/json" }));

// 10 MB limit — sticker creation sends base64-encoded images in the JSON body.
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

const sessionSecret = process.env.SESSION_SECRET ?? "daybook-dev-secret-change-me";

app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: "auto", // let express-session decide based on the connection (works with trust proxy)
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }),
);

app.use(passport.initialize());
app.use(passport.session());

app.use("/api", router);

// ── CI / staging: serve admin SPA from same port ─────────────────────────────
// When SERVE_ADMIN_DIST is set, the API server also serves the built admin app.
// This lets the E2E test runner point Playwright at a single origin so that
// /api/* calls from the SPA work without a separate reverse proxy.
//
// In production, the admin is served by its own Vite process (separate artifact).
// Never set SERVE_ADMIN_DIST in production.
const adminDist = process.env["SERVE_ADMIN_DIST"];
if (adminDist) {
  const distPath = path.resolve(adminDist);
  app.use(express.static(distPath));
  // SPA fallback — any non-/api path serves index.html
  app.get(/^(?!\/api).*$/, (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
  logger.info({ distPath }, "Serving admin SPA (SERVE_ADMIN_DIST mode)");
}

export default app;
