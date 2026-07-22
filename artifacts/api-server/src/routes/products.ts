import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { relatedProductsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireStaff } from "../lib/auth-middleware";
import {
  ListProductsQueryParams,
  CreateProductBody,
  UpdateProductBody,
  GetProductParams,
  UpdateProductParams,
  DeleteProductParams,
  PublishProductParams,
  UnpublishProductParams,
} from "@workspace/api-zod";
import { toSlug } from "../lib/slug";

const router: IRouter = Router();

router.get("/products", async (req, res): Promise<void> => {
  const params = ListProductsQueryParams.safeParse(req.query);
  const status = params.success ? params.data.status : undefined;
  let products;
  if (!status || status === "all") {
    products = await db.select().from(relatedProductsTable).orderBy(relatedProductsTable.createdAt);
  } else {
    products = await db.select().from(relatedProductsTable).where(eq(relatedProductsTable.status, status)).orderBy(relatedProductsTable.createdAt);
  }
  res.json(products);
});

router.post("/products", requireStaff, async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const slug = parsed.data.slug ?? toSlug(parsed.data.name);
  const [product] = await db.insert(relatedProductsTable).values({ ...parsed.data, slug, status: "draft" }).returning();
  res.status(201).json(product);
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [product] = await db.select().from(relatedProductsTable).where(eq(relatedProductsTable.id, params.data.id));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  res.json(product);
});

router.patch("/products/:id", requireStaff, async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [product] = await db.update(relatedProductsTable).set(parsed.data).where(eq(relatedProductsTable.id, params.data.id)).returning();
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  res.json(product);
});

router.delete("/products/:id", requireStaff, async (req, res): Promise<void> => {
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [product] = await db.delete(relatedProductsTable).where(eq(relatedProductsTable.id, params.data.id)).returning();
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  res.sendStatus(204);
});

router.post("/products/:id/publish", requireStaff, async (req, res): Promise<void> => {
  const params = PublishProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [product] = await db.update(relatedProductsTable).set({ status: "live" }).where(eq(relatedProductsTable.id, params.data.id)).returning();
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  res.json(product);
});

router.post("/products/:id/unpublish", requireStaff, async (req, res): Promise<void> => {
  const params = UnpublishProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [product] = await db.update(relatedProductsTable).set({ status: "draft" }).where(eq(relatedProductsTable.id, params.data.id)).returning();
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  res.json(product);
});

export default router;
