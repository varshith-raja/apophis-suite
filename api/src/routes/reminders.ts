import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { runReminders } from "../domain/reminders";
import { isLiveMail } from "../lib/mailer";

const r = Router();

r.get("/reminders", requireAuth, async (_req, res) =>
  res.json(
    await prisma.reminder.findMany({
      include: { invoice: { include: { client: true } } },
      orderBy: { scheduledFor: "desc" },
      take: 50,
    })
  )
);

r.post("/admin/run-reminders", requireAuth, requireRole("ADMIN", "FINANCE"), async (_req, res) => {
  const result = await runReminders(prisma);
  res.json({ ...result, mailMode: isLiveMail() ? "smtp" : "preview" });
});

export default r;
