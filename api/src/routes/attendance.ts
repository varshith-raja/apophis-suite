import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, AuthedReq } from "../middleware/auth";
import { availableFromLots, consumeCasual } from "../domain/leave";

const r = Router();

// ---------- Leave types & balances ----------
r.get("/leave-types", requireAuth, async (_req, res) =>
  res.json(await prisma.leaveType.findMany({ orderBy: { name: "asc" } }))
);

async function balancesFor(userId: string) {
  const types = await prisma.leaveType.findMany();
  const now = new Date();
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const mEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const out: any[] = [];
  for (const t of types) {
    if (t.policyType === "ACCRUAL_LOT") {
      const grants = await prisma.leaveGrant.findMany({
        where: { userId, leaveTypeId: t.id },
        orderBy: [{ expiresOn: "asc" }],
      });
      out.push({ kind: "ACCRUAL", leaveType: t.name, leaveTypeId: t.id, available: availableFromLots(grants), lots: grants });
    } else if (t.policyType === "MONTHLY_QUOTA") {
      const used = await prisma.attendanceRecord.count({ where: { userId, status: "WFH", date: { gte: mStart, lte: mEnd } } });
      out.push({
        kind: "QUOTA", leaveType: t.name, leaveTypeId: t.id, used,
        limit: Number(t.monthlyGrant ?? 0), maxLimit: Number(t.maxBalance ?? t.monthlyGrant ?? 0),
      });
    }
  }
  return out;
}

// HR / managers can inspect anyone
r.get("/balances", requireAuth, requireRole("ADMIN", "HR", "MANAGER"), async (req, res) =>
  res.json(await balancesFor(String(req.query.userId)))
);

// Self-service: the logged-in user's own balances and requests
r.get("/my/balances", requireAuth, async (req: AuthedReq, res) =>
  res.json(await balancesFor(req.user!.id))
);
r.get("/my/leave-requests", requireAuth, async (req: AuthedReq, res) =>
  res.json(
    await prisma.leaveRequest.findMany({
      where: { userId: req.user!.id },
      include: { leaveType: true },
      orderBy: { createdAt: "desc" },
    })
  )
);

// ---------- Attendance ----------
r.get("/attendance", requireAuth, async (req, res) => {
  const { userId, from, to } = req.query as Record<string, string>;
  res.json(
    await prisma.attendanceRecord.findMany({
      where: {
        ...(userId ? { userId } : {}),
        ...(from || to ? { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
      },
      include: { user: { select: { name: true } } },
      orderBy: [{ date: "asc" }],
    })
  );
});

// §3.2 — check-in after 10:15 flags `late`
r.post("/attendance", requireAuth, requireRole("ADMIN", "HR"), async (req, res) => {
  const { userId, date, checkIn, checkOut, status, refusedAfterLate } = req.body;
  const ci = checkIn ? new Date(checkIn) : null;
  const co = checkOut ? new Date(checkOut) : null;
  const lateByTime = ci ? ci.getHours() > 10 || (ci.getHours() === 10 && ci.getMinutes() > 15) : false;
  const late = lateByTime || status === "LATE";
  const hours = ci && co ? (co.getTime() - ci.getTime()) / 3.6e6 : null;
  const record = await prisma.attendanceRecord.upsert({
    where: { userId_date: { userId, date: new Date(date) } },
    update: { checkIn: ci, checkOut: co, status, hours, late, refusedAfterLate: !!refusedAfterLate },
    create: { userId, date: new Date(date), checkIn: ci, checkOut: co, status: status ?? "PRESENT", hours, late, refusedAfterLate: !!refusedAfterLate },
  });
  res.status(201).json(record);
});

// ---------- Leave requests ----------
r.get("/leave-requests", requireAuth, async (req, res) => {
  const { status, userId } = req.query as Record<string, string>;
  res.json(
    await prisma.leaveRequest.findMany({
      where: { ...(status ? { status: status as any } : {}), ...(userId ? { userId } : {}) },
      include: { user: { select: { name: true } }, leaveType: true },
      orderBy: { createdAt: "desc" },
    })
  );
});

// §2.2 — notice by the 25th of the preceding month → otherwise shortNotice
r.post("/leave-requests", requireAuth, async (req: AuthedReq, res) => {
  const { leaveTypeId, mode, startDate, endDate, days } = req.body;
  const start = new Date(startDate);
  const noticeDeadline = new Date(start.getFullYear(), start.getMonth() - 1, 25);
  const shortNotice = mode === "PLANNED" && new Date() > noticeDeadline;
  const lr = await prisma.leaveRequest.create({
    data: {
      userId: req.user!.id, leaveTypeId, mode: mode ?? "NORMAL",
      startDate: start, endDate: new Date(endDate), days, shortNotice,
    },
  });
  res.status(201).json(lr);
});

// Approval consumes casual lots FIFO; overflow recorded as LOP
r.patch("/leave-requests/:id/approve", requireAuth, requireRole("ADMIN", "MANAGER", "HR"), async (req: AuthedReq, res) => {
  const lr = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: req.params.id }, include: { leaveType: true } });
  let paidDays = Number(lr.days), lopDays = 0;
  if (lr.leaveType.policyType === "ACCRUAL_LOT") {
    const result = await consumeCasual(prisma, lr.userId, lr.leaveTypeId, Number(lr.days));
    paidDays = result.paidDays;
    lopDays = result.lopDays;
  }
  const updated = await prisma.leaveRequest.update({
    where: { id: lr.id },
    data: { status: "APPROVED", approverId: req.user!.id, paidDays, lopDays },
  });
  res.json(updated);
});

r.patch("/leave-requests/:id/reject", requireAuth, requireRole("ADMIN", "MANAGER", "HR"), async (req: AuthedReq, res) =>
  res.json(await prisma.leaveRequest.update({ where: { id: req.params.id }, data: { status: "REJECTED", approverId: req.user!.id } }))
);

export default r;
