import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import adminRouter from "./admin";
import catalogRouter from "./catalog";
import plannersRouter from "./planners";
import googleSyncRouter from "./google-sync";
import aiRouter from "./ai";
import billingRouter from "./billing";
import usersRouter from "./users";
import plansRouter from "./plans";
import aiSettingsRouter from "./ai-settings";
import storesRouter from "./stores";
import ownedCatalogRouter from "./owned-catalog";
import stickersRouter from "./stickers";
import platformRouter from "./platform";
import meRouter from "./me";
import inkRouter from "./ink";
import shopRouter from "./shop";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminRouter);
router.use(catalogRouter);
router.use(plannersRouter);
router.use("/sync", googleSyncRouter);
router.use(aiRouter);
router.use(billingRouter);
router.use(usersRouter);
router.use(plansRouter);
router.use(aiSettingsRouter);
// Multi-tenant store platform
router.use(storesRouter);
router.use(ownedCatalogRouter);
router.use(stickersRouter);
router.use(platformRouter);
router.use(meRouter);
router.use(inkRouter);
// Public storefront API (no auth required)
router.use(shopRouter);

export default router;
