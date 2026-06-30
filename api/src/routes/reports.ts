import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { toCsv } from "../domain/kpis";
import { streamReport, Column } from "../lib/pdf";

const r = Router();
const inr = (n: number) => "Rs " + n.toLocaleString("en-IN"); // ASCII for PDF font safety

const COLUMNS: Record<string, { title: string; columns: Column[] }> = {
  payments: {
    title: "Accounts receivable",
    columns: [
      { header: "Invoice", key: "invoice", width: 18 },
      { header: "Client", key: "client", width: 26 },
      { header: "Amount", key: "amount", width: 16, align: "right" },
      { header: "Paid", key: "paid", width: 14, align: "right" },
      { header: "Outstanding", key: "outstanding", width: 16, align: "right" },
      { header: "Due", key: "dueDate", width: 14 },
      { header: "Status", key: "status", width: 14 },
    ],
  },
  budget: {
    title: "Transactions",
    columns: [
      { header: "Date", key: "date", width: 16 },
      { header: "Type", key: "type", width: 14 },
      { header: "Amount", key: "amount", width: 16, align: "right" },
      { header: "Category", key: "category", width: 22 },
      { header: "Description", key: "description", width: 32 },
    ],
  },
  attendance: {
    title: "Attendance",
    columns: [
      { header: "Emp", key: "empId", width: 12 },
      { header: "Name", key: "name", width: 24 },
      { header: "Date", key: "date", width: 16 },
      { header: "Status", key: "status", width: 16 },
      { header: "Late", key: "late", width: 10 },
      { header: "Hours", key: "hours", width: 12, align: "right" },
    ],
  },
  payroll: {
    title: "Payroll adjustments",
    columns: [
      { header: "Emp", key: "empId", width: 10 },
      { header: "Name", key: "name", width: 20 },
      { header: "Date", key: "date", width: 14 },
      { header: "Type", key: "type", width: 18 },
      { header: "Fraction", key: "fraction", width: 12, align: "right" },
      { header: "Amount", key: "amount", width: 14, align: "right" },
      { header: "Note", key: "note", width: 28 },
    ],
  },
};

async function buildRows(module: string, forPdf: boolean): Promise<Record<string, any>[]> {
  if (module === "payments") {
    const invoices = await prisma.invoice.findMany({ include: { client: true, payments: true }, orderBy: { dueDate: "asc" } });
    return invoices.map((i) => {
      const paid = i.payments.reduce((s, p) => s + Number(p.amount), 0);
      const amount = Number(i.amount);
      return {
        invoice: i.invoiceNumber, client: i.client.name,
        amount: forPdf ? inr(amount) : amount,
        paid: forPdf ? inr(paid) : paid,
        outstanding: forPdf ? inr(amount - paid) : amount - paid,
        dueDate: i.dueDate.toISOString().slice(0, 10), status: i.status,
      };
    });
  }
  if (module === "budget") {
    const txns = await prisma.transaction.findMany({ include: { category: true }, orderBy: { date: "asc" } });
    return txns.map((t) => ({
      date: t.date.toISOString().slice(0, 10), type: t.type,
      amount: forPdf ? inr(Number(t.amount)) : Number(t.amount),
      category: t.category?.name ?? "", description: t.description ?? "",
    }));
  }
  if (module === "attendance") {
    const recs = await prisma.attendanceRecord.findMany({ include: { user: true }, orderBy: [{ date: "asc" }] });
    return recs.map((a) => ({
      empId: a.user.empId ?? "", name: a.user.name, date: a.date.toISOString().slice(0, 10),
      status: a.status, late: a.late ? "YES" : "", hours: a.hours ? Number(a.hours) : "",
    }));
  }
  if (module === "payroll") {
    const adj = await prisma.payrollAdjustment.findMany({ include: { user: true }, orderBy: [{ date: "asc" }] });
    return adj.map((a) => ({
      empId: a.user.empId ?? "", name: a.user.name, date: a.date.toISOString().slice(0, 10),
      type: a.type, fraction: a.unitFraction ? Number(a.unitFraction) : "",
      amount: a.amount ? (forPdf ? inr(Number(a.amount)) : Number(a.amount)) : "", note: a.note ?? "",
    }));
  }
  return [];
}

r.get("/reports/:module/export", requireAuth, async (req, res) => {
  const { module } = req.params;
  const fmt = String(req.query.format ?? "csv");
  if (!COLUMNS[module]) return res.status(404).json({ error: "Unknown module" });

  const rows = await buildRows(module, fmt === "pdf");

  if (fmt === "pdf") {
    return streamReport(res, {
      filename: `${module}.pdf`,
      title: COLUMNS[module].title,
      subtitle: `${rows.length} record${rows.length === 1 ? "" : "s"}`,
      columns: COLUMNS[module].columns,
      rows,
    });
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${module}.csv"`);
  res.send(toCsv(rows));
});

export default r;
