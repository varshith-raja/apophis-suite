// Budget KPIs and a generic CSV serializer.

export function budgetKpis(
  txns: { type: string; amount: any; date: Date }[],
  plannedTotal: number,
  from: Date,
  to: Date
) {
  const income = txns.filter((t) => t.type === "INCOME").reduce((s, t) => s + Number(t.amount), 0);
  const expense = txns.filter((t) => t.type === "EXPENSE").reduce((s, t) => s + Number(t.amount), 0);
  const months = Math.max(1, (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth() + 1);

  // monthly cash-flow series (net per month) for the chart
  const series: Record<string, { income: number; expense: number }> = {};
  for (const t of txns) {
    const k = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, "0")}`;
    series[k] ??= { income: 0, expense: 0 };
    series[k][t.type === "INCOME" ? "income" : "expense"] += Number(t.amount);
  }

  const cashflow = Object.entries(series)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v, net: v.income - v.expense }));

  return {
    income,
    expense,
    net: income - expense,
    margin: income ? ((income - expense) / income) * 100 : 0,
    burnRate: expense / months,
    varianceVsPlan: expense - plannedTotal, // > 0 = over budget
    cashflow,
    forecast: forecastNet(cashflow, 3),
  };
}

// Project the next `ahead` months of net cash flow via least-squares trend on history.
function forecastNet(cashflow: { month: string; net: number }[], ahead: number) {
  const pts = cashflow.map((c, i) => ({ x: i, y: c.net }));
  if (pts.length < 2) {
    const last = pts.at(-1)?.y ?? 0;
    return nextMonths(cashflow.at(-1)?.month, ahead).map((month) => ({ month, net: Math.round(last), projected: true }));
  }
  const n = pts.length;
  const sx = pts.reduce((s, p) => s + p.x, 0);
  const sy = pts.reduce((s, p) => s + p.y, 0);
  const sxx = pts.reduce((s, p) => s + p.x * p.x, 0);
  const sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
  const intercept = (sy - slope * sx) / n;
  return nextMonths(cashflow.at(-1)?.month, ahead).map((month, k) => ({
    month,
    net: Math.round(intercept + slope * (n - 1 + k + 1)),
    projected: true,
  }));
}

function nextMonths(fromKey: string | undefined, count: number): string[] {
  const base = fromKey ? new Date(fromKey + "-01") : new Date();
  const out: string[] = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export function toCsv(rows: Record<string, any>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: any) => {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}
