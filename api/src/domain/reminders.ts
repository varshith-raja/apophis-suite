import { PrismaClient } from "@prisma/client";
import { sendMail } from "../lib/mailer";

const inr = (n: number) => "₹" + n.toLocaleString("en-IN");
const inDays = (ms: number) => ms / 86_400_000;

// Find unpaid invoices that are overdue or due soon, and send (at most one per kind per cooldown window).
export async function runReminders(
  prisma: PrismaClient,
  opts: { upcomingWindowDays?: number; cooldownDays?: number } = {}
) {
  const upcomingWindow = opts.upcomingWindowDays ?? 3;
  const cooldown = opts.cooldownDays ?? 7;
  const now = new Date();
  const invoices = await prisma.invoice.findMany({ include: { client: true, payments: true } });
  const sent: { invoice: string; client: string; kind: string; to: string }[] = [];
  const skipped: { invoice: string; reason: string }[] = [];

  for (const inv of invoices) {
    const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    const outstanding = Number(inv.amount) - paid;
    if (outstanding <= 0) continue; // fully paid

    const dueIn = inDays(+new Date(inv.dueDate) - +now);
    const kind: "OVERDUE" | "UPCOMING" | null =
      dueIn < 0 ? "OVERDUE" : dueIn <= upcomingWindow ? "UPCOMING" : null;
    if (!kind) continue;

    if (!inv.client?.email) { skipped.push({ invoice: inv.invoiceNumber, reason: "no client email" }); continue; }

    const recent = await prisma.reminder.findFirst({
      where: { invoiceId: inv.id, kind, sentAt: { gte: new Date(+now - cooldown * 86_400_000) } },
    });
    if (recent) { skipped.push({ invoice: inv.invoiceNumber, reason: "within cooldown" }); continue; }

    const daysOverdue = Math.max(0, Math.floor(-dueIn));
    const due = new Date(inv.dueDate).toLocaleDateString("en-IN");
    const hello = `Hi ${inv.client.contact || inv.client.name},`;
    const subject = kind === "OVERDUE" ? `Payment overdue — ${inv.invoiceNumber}` : `Payment due soon — ${inv.invoiceNumber}`;
    const text =
      kind === "OVERDUE"
        ? `${hello}\n\nInvoice ${inv.invoiceNumber} for ${inr(outstanding)} was due on ${due} (${daysOverdue} day${daysOverdue === 1 ? "" : "s"} ago). Please arrange payment at your earliest convenience.\n\nThank you,\nApophis Solutions`
        : `${hello}\n\nA friendly reminder that invoice ${inv.invoiceNumber} for ${inr(outstanding)} is due on ${due}.\n\nThank you,\nApophis Solutions`;

    const rec = await prisma.reminder.create({
      data: { invoiceId: inv.id, kind, channel: "EMAIL", scheduledFor: now, status: "SENDING" },
    });
    try {
      await sendMail({ to: inv.client.email, subject, text });
      await prisma.reminder.update({ where: { id: rec.id }, data: { sentAt: new Date(), status: "SENT" } });
      sent.push({ invoice: inv.invoiceNumber, client: inv.client.name, kind, to: inv.client.email });
    } catch {
      await prisma.reminder.update({ where: { id: rec.id }, data: { status: "FAILED" } });
      skipped.push({ invoice: inv.invoiceNumber, reason: "send failed" });
    }
  }

  return { sent, skipped };
}
