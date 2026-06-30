import { PrismaClient, LeaveType } from "@prisma/client";

// ---- date helpers ----
export const endOfMonth = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
export const addMonths = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
export const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

// ---- §2.3 Casual: grant one lot, expiring end of next month ----
export async function grantCasualLot(
  prisma: PrismaClient,
  userId: string,
  type: LeaveType,
  when: Date
) {
  const life = type.lotLifetimeMonths ?? 1;
  const expiresOn = endOfMonth(addMonths(when, life - 1));
  // idempotent per (user, type, grant-month)
  const existing = await prisma.leaveGrant.findFirst({
    where: { userId, leaveTypeId: type.id, grantedOn: when },
  });
  if (existing) return existing;
  return prisma.leaveGrant.create({
    data: { userId, leaveTypeId: type.id, amount: type.monthlyGrant ?? 1, grantedOn: when, expiresOn },
  });
}

// Available = unexpired, unused portions across all lots
export function availableFromLots(
  grants: { amount: any; used: any; expiresOn: Date | null }[],
  asOf = new Date()
) {
  return grants
    .filter((g) => !g.expiresOn || g.expiresOn >= asOf)
    .reduce((s, g) => s + (Number(g.amount) - Number(g.used)), 0);
}

// ---- FIFO consumption (soonest expiry first); overflow → LOP ----
export async function consumeCasual(
  prisma: PrismaClient,
  userId: string,
  leaveTypeId: string,
  days: number
): Promise<{ paidDays: number; lopDays: number }> {
  const lots = await prisma.leaveGrant.findMany({
    where: { userId, leaveTypeId, OR: [{ expiresOn: null }, { expiresOn: { gte: new Date() } }] },
    orderBy: [{ expiresOn: "asc" }],
  });
  let remaining = days;
  for (const lot of lots) {
    if (remaining <= 0) break;
    const free = Number(lot.amount) - Number(lot.used);
    if (free <= 0) continue;
    const take = Math.min(free, remaining);
    await prisma.leaveGrant.update({ where: { id: lot.id }, data: { used: { increment: take } } });
    remaining -= take;
  }
  return { paidDays: days - remaining, lopDays: remaining };
}

// ---- §2.1 Sick: group consecutive sick days into occurrences ----
// Day 0 paid, days 1+ LOP. Default: a weekend gap does NOT break an occurrence.
export function sickOccurrences(sickDates: Date[]): Date[][] {
  const sorted = [...sickDates].sort((a, b) => +a - +b);
  const groups: Date[][] = [];
  for (const d of sorted) {
    const prev = groups.at(-1)?.at(-1);
    if (prev && contiguousIgnoringWeekends(prev, d)) groups.at(-1)!.push(d);
    else groups.push([d]);
  }
  return groups;
}

// true if every calendar day strictly between a and b is a weekend
function contiguousIgnoringWeekends(a: Date, b: Date): boolean {
  const cur = new Date(a);
  cur.setDate(cur.getDate() + 1);
  while (cur < stripTime(b)) {
    if (!isWeekend(cur)) return false;
    cur.setDate(cur.getDate() + 1);
  }
  return true;
}
const stripTime = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
