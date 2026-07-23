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

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminRouter);
router.use(catalogRouter);
router.use(plannersRouter);
router.use(googleSyncRouter);
router.use(aiRouter);
router.use(billingRouter);
router.use(usersRouter);
router.use(plansRouter);
router.use(aiSettingsRouter);

export default router;
