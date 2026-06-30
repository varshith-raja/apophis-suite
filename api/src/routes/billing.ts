import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, AuthedReq } from "../middleware/auth";

const r = Router();

// ---------- Clients ----------
r.get("/clients", requireAuth, async (_req, res) =>
  res.json(await prisma.client.findMany({ orderBy: { name: "asc" } }))
);
r.post("/clients", requireAuth, requireRole("ADMIN", "FINANCE", "MANAGER"), async (req, res) =>
  res.status(201).json(await prisma.client.create({ data: req.body }))
);
r.patch("/clients/:id", requireAuth, requireRole("ADMIN", "FINANCE", "MANAGER"), async (req, res) =>
  res.json(await prisma.client.update({ where: { id: req.params.id }, data: req.body }))
);
r.delete("/clients/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  await prisma.client.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// ---------- Invoices ----------
r.get("/invoices", requireAuth, async (req, res) => {
  const { status, clientId } = req.query as Record<string, string>;
  res.json(
    await prisma.invoice.findMany({
      where: { ...(status ? { status: status as any } : {}), ...(clientId ? { clientId } : {}) },
      include: { client: true, payments: true },
      orderBy: { dueDate: "asc" },
    })
  );
});

r.post("/invoices", requireAuth, requireRole("ADMIN", "FINANCE"), async (req, res) => {
  const { dueDate, issueDate, ...rest } = req.body;
  res.status(201).json(
    await prisma.invoice.create({
      data: { ...rest, dueDate: new Date(dueDate), ...(issueDate ? { issueDate: new Date(issueDate) } : {}) },
    })
  );
});

r.patch("/invoices/:id", requireAuth, requireRole("ADMIN", "FINANCE"), async (req, res) =>
  res.json(await prisma.invoice.update({ where: { id: req.params.id }, data: req.body }))
);

r.post("/invoices/:id/payments", requireAuth, requireRole("ADMIN", "FINANCE"), async (req, res) => {
  const { amount, paidDate, method, reference } = req.body;
  const payment = await prisma.payment.create({
    data: { invoiceId: req.params.id, amount, method, reference, ...(paidDate ? { paidDate: new Date(paidDate) } : {}) },
  });
  // reconcile status
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: req.params.id }, include: { payments: true } });
  const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
  if (paid >= Number(inv.amount))
    await prisma.invoice.update({ where: { id: inv.id }, data: { status: "PAID" } });
  res.status(201).json(payment);
});

// ---------- Dashboard: reconciled board ----------
r.get("/dashboard/payments", requireAuth, async (_req, res) => {
  const invoices = await prisma.invoice.findMany({ include: { client: true, payments: true }, orderBy: { dueDate: "asc" } });
  const now = new Date();
  const enriched = invoices.map((inv) => {
    const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    const amount = Number(inv.amount);
    let status = inv.status as string;
    if (paid >= amount) status = "PAID";
    else if (new Date(inv.dueDate) < now) status = "OVERDUE";
    return {
      id: inv.id, invoiceNumber: inv.invoiceNumber, client: inv.client.name,
      clientEmail: inv.client.email, clientPhone: inv.client.phone,
      amount, paid, outstanding: amount - paid, dueDate: inv.dueDate, status,
    };
  });
  const cols = ["PENDING", "IN_PROGRESS", "PAID", "OVERDUE"];
  const board = Object.fromEntries(cols.map((c) => [c, enriched.filter((i) => i.status === c)]));
  const totals = {
    outstanding: enriched.reduce((s, i) => s + i.outstanding, 0),
    overdue: enriched.filter((i) => i.status === "OVERDUE").reduce((s, i) => s + i.outstanding, 0),
    collectedThisMonth: invoices
      .flatMap((i) => i.payments)
      .filter((p) => p.paidDate.getMonth() === now.getMonth() && p.paidDate.getFullYear() === now.getFullYear())
      .reduce((s, p) => s + Number(p.amount), 0),
  };
  res.json({ board, totals });
});

export default r;
