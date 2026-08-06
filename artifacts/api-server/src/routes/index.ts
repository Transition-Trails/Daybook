import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
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
import platformStickersRouter from "./platform-stickers";
import meRouter from "./me";
import inkRouter from "./ink";
import shopRouter from "./shop";
import storeProfileRouter from "./store-profile";
import marketingRouter from "./marketing";
import storeStudiosRouter from "./store-studios";
import stickerPresetsRouter from "./sticker-presets";
import widgetsRouter from "./widgets";
import storePlannersRouter from "./store-planners";
import plannerHotspotsRouter from "./planner-hotspots";
import platformPlannersRouter from "./platform-planners";
import platformRecipesRouter  from "./platform-recipes";
import supportRouter from "./support";
import emailSettingsRouter from "./email-settings";
import webhooksRouter from "./webhooks";
import ordersRouter from "./orders";
import qualityRouter from "./quality";
import promoteRouter from "./promote";
import worldsmithRouter from "./worldsmith";
import worldsmithEditorialRouter from "./worldsmith-editorial";
import releasesRouter from "./releases";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
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
router.use(platformStickersRouter);
router.use(meRouter);
router.use(inkRouter);
router.use(storeProfileRouter);
router.use(storeStudiosRouter);
router.use(stickerPresetsRouter);
router.use(widgetsRouter);
router.use(storePlannersRouter);
router.use(plannerHotspotsRouter);
router.use(platformPlannersRouter);
router.use(platformRecipesRouter);
router.use(supportRouter);
router.use(emailSettingsRouter);
router.use(webhooksRouter);
router.use(ordersRouter);
router.use(qualityRouter);
router.use(promoteRouter);
router.use(marketingRouter);
// WorldSmith Prompt Compiler
router.use(worldsmithRouter);
// WorldSmith Editorial Suite (local-first authoring)
router.use(worldsmithEditorialRouter);
// Platform release tracking
router.use(releasesRouter);
// Public storefront API (no auth required)
router.use(shopRouter);

export default router;
