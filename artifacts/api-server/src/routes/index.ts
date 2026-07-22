import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import adminRouter from "./admin";
import themesRouter from "./themes";
import stickerPacksRouter from "./sticker-packs";
import insertsRouter from "./inserts";
import productsRouter from "./products";
import editionsRouter from "./editions";
import plansRouter from "./plans";
import usersRouter from "./users";
import plannerConfigsRouter from "./planner-configs";
import generationRouter from "./generation";
import syncRouter from "./sync";
import aiRouter from "./ai";
import billingRouter from "./billing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminRouter);
router.use(themesRouter);
router.use(stickerPacksRouter);
router.use(insertsRouter);
router.use(productsRouter);
router.use(editionsRouter);
router.use(plansRouter);
router.use(usersRouter);
router.use(plannerConfigsRouter);
router.use(generationRouter);
router.use(syncRouter);
router.use(aiRouter);
router.use(billingRouter);

export default router;
