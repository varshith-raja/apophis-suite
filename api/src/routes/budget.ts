import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, AuthedReq } from "../middleware/auth";
import { budgetKpis } from "../domain/kpis";

const r = Router();

r.get("/categories", requireAuth, async (_req, res) =>
  res.json(await prisma.category.findMany({ orderBy: { name: "asc" } }))
);
r.post("/categories", requireAuth, requireRole("ADMIN", "FINANCE"), async (req, res) =>
  res.status(201).json(await prisma.category.create({ data: req.body }))
);

r.get("/transactions", requireAuth, async (req, res) => {
  const { type, from, to } = req.query as Record<string, string>;
  res.json(
    await prisma.transaction.findMany({
      where: {
        ...(type ? { type: type as any } : {}),
        ...(from || to ? { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
      },
      include: { category: true },
      orderBy: { date: "desc" },
    })
  );
});

r.post("/transactions", requireAuth, requireRole("ADMIN", "FINANCE"), async (req: AuthedReq, res) => {
  const { type, amount, date, description, categoryId } = req.body;
  res.status(201).json(
    await prisma.transaction.create({
      data: { type, amount, description, categoryId, createdById: req.user!.id, ...(date ? { date: new Date(date) } : {}) },
    })
  );
});

r.patch("/transactions/:id", requireAuth, requireRole("ADMIN", "FINANCE"), async (req, res) =>
  res.json(await prisma.transaction.update({ where: { id: req.params.id }, data: req.body }))
);
r.delete("/transactions/:id", requireAuth, requireRole("ADMIN", "FINANCE"), async (req, res) => {
  await prisma.transaction.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

r.get("/dashboard/budget", requireAuth, async (req, res) => {
  const from = new Date(String(req.query.from ?? new Date(new Date().getFullYear(), 0, 1)));
  const to = new Date(String(req.query.to ?? new Date()));
  const [txns, budgets] = await Promise.all([
    prisma.transaction.findMany({ where: { date: { gte: from, lte: to } } }),
    prisma.budget.findMany({ where: { periodStart: { lte: to }, periodEnd: { gte: from } } }),
  ]);
  const planned = budgets.reduce((s, b) => s + Number(b.plannedAmount), 0);
  res.json(budgetKpis(txns, planned, from, to));
});

export default r;
