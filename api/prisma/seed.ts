import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const hash = (p: string) => bcrypt.hashSync(p, 10);
const DR = 1500; // sample daily rate so payroll lines compute rupees

// code -> enum
const CODE: Record<string, string> = {
  P: "PRESENT", L: "LATE", A: "ABSENT", WFH: "WFH", CL: "CASUAL",
  SL: "SICK", PL: "PLANNED", CO: "COMP_OFF", LOP: "LOP", H: "HOLIDAY", EM: "EMERGENCY",
};

// Real team (E004/E007/E012 intentionally absent, as in the sheet)
const TEAM = [
  { empId: "E001", name: "Sruthi", designation: "Manager", role: "MANAGER" },
  { empId: "E002", name: "Sneha", designation: "SMM", role: "VIEWER" },
  { empId: "E003", name: "Mouli", designation: "SMM", role: "VIEWER" },
  { empId: "E005", name: "Sharanya", designation: "Script", role: "VIEWER" },
  { empId: "E006", name: "Bala", designation: "Shoot", role: "VIEWER" },
  { empId: "E008", name: "Praveen", designation: "Edit", role: "VIEWER" },
  { empId: "E009", name: "Naveen", designation: "Edit", role: "VIEWER" },
  { empId: "E010", name: "Deepesh", designation: "Edit", role: "VIEWER" },
  { empId: "E011", name: "Arul", designation: "Meta", role: "VIEWER" },
  { empId: "E013", name: "Devi", designation: "Telle Caller", role: "VIEWER" },
  { empId: "E014", name: "Varshith", designation: "Sales", role: "VIEWER" },
  { empId: "E015", name: "SGS", designation: "Management", role: "ADMIN" },
];

// June 2026 working days (Sundays 7/14/21 excluded). Status rows transcribed from the workbook.
const DAYS = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 22];
const GRID: Record<string, string[]> = {
  E001: ["P","L","L","L","L","L","P","L","P","P","P","P","P","P","P","P","P","P","P"],
  E002: ["P","P","P","P","P","P","P","P","P","P","P","P","P","P","P","L","P","P","P"],
  E003: ["P","P","P","P","L","P","P","L","A","A","CO","WFH","P","L","P","P","P","P","P"],
  E005: ["P","P","P","P","P","P","P","L","P","P","P","P","SL","P","P","P","P","P","WFH"],
  E008: ["P","P","P","P","L","P","P","L","P","L","P","P","P","P","P","P","WFH","CL","SL"],
  E009: ["P","L","L","L","L","L","A","P","L","L","L","P","SL","P","L","P","P","P","L"],
};

async function main() {
  // operational logins not represented as line staff
  await prisma.user.create({ data: { name: "Admin", email: "admin@apophis.in", passwordHash: hash("password123"), role: "ADMIN", dailyRate: DR as any } });
  await prisma.user.create({ data: { name: "Finance", email: "finance@apophis.in", passwordHash: hash("password123"), role: "FINANCE", dailyRate: DR as any } });
  await prisma.user.create({ data: { name: "HR", email: "hr@apophis.in", passwordHash: hash("password123"), role: "HR", dailyRate: DR as any } });

  const users: Record<string, any> = {};
  for (const t of TEAM) {
    users[t.empId] = await prisma.user.create({
      data: {
        empId: t.empId, name: t.name, designation: t.designation, role: t.role as any,
        email: `${t.name.toLowerCase()}@apophis.in`, passwordHash: hash("password123"), dailyRate: DR as any,
      },
    });
  }

  // ---- Leave types (from §2/§3) ----
  const casual = await prisma.leaveType.create({ data: { name: "Casual", policyType: "ACCRUAL_LOT", monthlyGrant: 1 as any, maxBalance: 2 as any, lotLifetimeMonths: 2 } });
  await prisma.leaveType.create({ data: { name: "WFH", policyType: "MONTHLY_QUOTA", monthlyGrant: 2 as any, maxBalance: 4 as any } });
  await prisma.leaveType.create({ data: { name: "Sick", policyType: "PAID_THRESHOLD", paidThreshold: 1 as any } });
  await prisma.leaveType.create({ data: { name: "CompOff", policyType: "DISCRETIONARY" } });

  // ---- Casual lots ----
  // Everyone gets June's lot. Sneha also carries May's (→ 2 available, demonstrates accumulation).
  for (const t of TEAM) {
    await prisma.leaveGrant.create({ data: { userId: users[t.empId].id, leaveTypeId: casual.id, amount: 1 as any, grantedOn: new Date(2026, 5, 1), expiresOn: new Date(2026, 6, 31, 23, 59, 59) } });
  }
  await prisma.leaveGrant.create({ data: { userId: users.E002.id, leaveTypeId: casual.id, amount: 1 as any, grantedOn: new Date(2026, 4, 1), expiresOn: new Date(2026, 5, 30, 23, 59, 59) } }); // May lot, expires end June
  // Praveen used his June casual (CL on day 20)
  await prisma.leaveGrant.updateMany({ where: { userId: users.E008.id, leaveTypeId: casual.id, grantedOn: new Date(2026, 5, 1) }, data: { used: 1 as any } });

  // ---- Attendance slice ----
  for (const [empId, codes] of Object.entries(GRID)) {
    for (let i = 0; i < DAYS.length; i++) {
      const code = codes[i];
      const date = new Date(2026, 5, DAYS[i]);
      const isWorked = code === "P" || code === "L";
      const checkIn = isWorked ? new Date(2026, 5, DAYS[i], code === "L" ? 10 : 10, code === "L" ? 25 : 10) : null;
      await prisma.attendanceRecord.create({
        data: {
          userId: users[empId].id, date, status: CODE[code] as any,
          checkIn, late: code === "L", hours: isWorked ? (8.5 as any) : null,
        },
      });
    }
  }

  // ---- Payment follow-up sample ----
  const c1 = await prisma.client.create({ data: { name: "Cafe Aroma", company: "Aroma F&B Pvt Ltd", email: "owner@cafearoma.in", phone: "+91 98765 43210", contact: "Ramesh" } });
  const c2 = await prisma.client.create({ data: { name: "FitZone Gym", email: "admin@fitzone.in", phone: "+91 99887 76655", contact: "Divya" } });
  const c3 = await prisma.client.create({ data: { name: "Lotus Realty", email: "marketing@lotus.in", phone: "+91 90000 11111", contact: "Anil" } });

  const inv1 = await prisma.invoice.create({ data: { invoiceNumber: "AP-2026-001", clientId: c1.id, amount: 35000 as any, dueDate: new Date(2026, 5, 15), status: "PENDING", salesStatus: "Retainer" } });
  await prisma.invoice.create({ data: { invoiceNumber: "AP-2026-002", clientId: c2.id, amount: 22000 as any, dueDate: new Date(2026, 4, 28), status: "PENDING", salesStatus: "Project" } }); // overdue (reconciled on read)
  await prisma.invoice.create({ data: { invoiceNumber: "AP-2026-003", clientId: c3.id, amount: 50000 as any, dueDate: new Date(2026, 6, 10), status: "IN_PROGRESS", salesStatus: "Retainer" } });
  const inv4 = await prisma.invoice.create({ data: { invoiceNumber: "AP-2026-004", clientId: c1.id, amount: 18000 as any, dueDate: new Date(2026, 5, 5), status: "PENDING" } });
  await prisma.payment.create({ data: { invoiceId: inv4.id, amount: 18000 as any, method: "UPI", reference: "TXN-7781" } }); // fully paid → PAID on read
  await prisma.payment.create({ data: { invoiceId: inv1.id, amount: 15000 as any, method: "Bank", reference: "TXN-7790" } }); // partial

  // ---- Budget sample ----
  const inc = await prisma.category.create({ data: { name: "Client Retainers", type: "INCOME" } });
  const exp1 = await prisma.category.create({ data: { name: "Salaries", type: "EXPENSE" } });
  const exp2 = await prisma.category.create({ data: { name: "Software", type: "EXPENSE" } });
  const exp3 = await prisma.category.create({ data: { name: "Ad Spend", type: "EXPENSE" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { email: "finance@apophis.in" } });
  const tx = (type: string, amount: number, m: number, categoryId: string, description: string) =>
    prisma.transaction.create({ data: { type: type as any, amount: amount as any, date: new Date(2026, m, 10), categoryId, description, createdById: admin.id } });
  await tx("INCOME", 120000, 3, inc.id, "April retainers");
  await tx("INCOME", 135000, 4, inc.id, "May retainers");
  await tx("INCOME", 140000, 5, inc.id, "June retainers");
  await tx("EXPENSE", 80000, 3, exp1.id, "April payroll");
  await tx("EXPENSE", 80000, 4, exp1.id, "May payroll");
  await tx("EXPENSE", 85000, 5, exp1.id, "June payroll");
  await tx("EXPENSE", 12000, 5, exp2.id, "SaaS subscriptions");
  await tx("EXPENSE", 25000, 5, exp3.id, "Meta ads (rebilled)");
  await prisma.budget.create({ data: { name: "FY2026 Plan", periodStart: new Date(2026, 0, 1), periodEnd: new Date(2026, 11, 31), plannedAmount: 1000000 as any } });

  console.log("Seed complete. Login: admin@apophis.in / password123");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
