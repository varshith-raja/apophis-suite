import express from "express";
import cors from "cors";
import cron from "node-cron";
import { prisma } from "./lib/prisma";
import { requireAuth, requireRole, AuthedReq } from "./middleware/auth";
import { runMonthClose } from "./jobs/monthClose";
import { runReminders } from "./domain/reminders";

import auth from "./routes/auth";
import billing from "./routes/billing";
import budget from "./routes/budget";
import attendance from "./routes/attendance";
import reports from "./routes/reports";
import reminders from "./routes/reminders";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/auth", auth);
app.use("/", billing);
app.use("/", budget);
app.use("/", attendance);
app.use("/", reports);
app.use("/", reminders);

// Daily at 09:00 — send overdue / due-soon reminders
cron.schedule("0 9 * * *", () =>
  runReminders(prisma)
    .then((r) => console.log(`Reminder run: ${r.sent.length} sent, ${r.skipped.length} skipped`))
    .catch((e) => console.error("Reminder job failed:", e))
);

// Admin: trigger the monthly close (grants, merit, payroll)
app.post("/admin/month-close", requireAuth, requireRole("ADMIN", "HR"), async (req: AuthedReq, res) => {
  const { year, month } = req.body; // month = 1..12
  const result = await runMonthClose(prisma, Number(year), Number(month) - 1);
  res.json(result);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
