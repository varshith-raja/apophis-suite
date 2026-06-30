import { useEffect, useState } from "react";
import { api } from "../lib/api";

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const FROM = "2026-01-01", TO = "2026-12-31";

export default function Budget() {
  const [kpi, setKpi] = useState<any>(null);
  const [cats, setCats] = useState<any[]>([]);
  const [form, setForm] = useState({ type: "EXPENSE", amount: "", categoryId: "", description: "" });

  const load = () => api.get(`/dashboard/budget?from=${FROM}&to=${TO}`).then(setKpi);
  useEffect(() => { load(); api.get("/categories").then(setCats); }, []);
  if (!kpi) return <p>Loading…</p>;

  const add = async () => {
    if (!form.amount) return;
    await api.post("/transactions", { ...form, amount: Number(form.amount) });
    setForm({ ...form, amount: "", description: "" });
    load();
  };
  const max = Math.max(...kpi.cashflow.map((c: any) => Math.max(c.income, c.expense)), 1);

  // forecast line chart geometry
  const hist = kpi.cashflow.map((c: any) => ({ month: c.month, net: c.net }));
  const fc = (kpi.forecast || []).map((f: any) => ({ month: f.month, net: f.net }));
  const series = [...hist, ...fc];
  const CW = 600, CH = 150, PAD = 28;
  const nets = series.map((s) => s.net);
  const lo = Math.min(0, ...nets), hi = Math.max(0, ...nets);
  const xj = (i: number) => PAD + (i * (CW - 2 * PAD)) / Math.max(1, series.length - 1);
  const yj = (v: number) => CH - PAD - ((v - lo) / ((hi - lo) || 1)) * (CH - 2 * PAD);
  const histPts = hist.map((p: any, i: number) => `${xj(i)},${yj(p.net)}`).join(" ");
  const fcPts = hist.length
    ? [hist[hist.length - 1], ...fc].map((p: any, i: number) => `${xj(hist.length - 1 + i)},${yj(p.net)}`).join(" ")
    : "";

  return (
    <div>
      <div className="pagehead">
        <h2>Budget tracker</h2>
        <div className="row">
          <button className="ghost" onClick={() => api.download("budget", "csv")}>CSV</button>
          <button className="ghost" onClick={() => api.download("budget", "pdf")}>PDF</button>
        </div>
      </div>
      <div className="kpis">
        <div className="kpi"><span>Income</span><b>{inr(kpi.income)}</b></div>
        <div className="kpi"><span>Expense</span><b>{inr(kpi.expense)}</b></div>
        <div className="kpi"><span>Net</span><b>{inr(kpi.net)}</b></div>
        <div className="kpi"><span>Margin</span><b>{kpi.margin.toFixed(1)}%</b></div>
        <div className="kpi"><span>Burn / mo</span><b>{inr(kpi.burnRate)}</b></div>
        <div className={"kpi " + (kpi.varianceVsPlan > 0 ? "bad" : "good")}><span>Variance vs plan</span><b>{inr(kpi.varianceVsPlan)}</b></div>
      </div>

      <div className="panel">
        <h3>Monthly cash flow</h3>
        <div className="bars">
          {kpi.cashflow.map((c: any) => (
            <div key={c.month} className="barcol">
              <div className="bar inc" style={{ height: (c.income / max) * 120 }} title={"Income " + inr(c.income)} />
              <div className="bar exp" style={{ height: (c.expense / max) * 120 }} title={"Expense " + inr(c.expense)} />
              <span>{c.month.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>

      {series.length > 0 && (
        <div className="panel">
          <h3>Net cash flow & forecast</h3>
          <svg viewBox={`0 0 ${CW} ${CH}`} className="chart">
            <line x1={PAD} y1={yj(0)} x2={CW - PAD} y2={yj(0)} stroke="#d2dae6" strokeDasharray="2 2" />
            <polyline points={histPts} fill="none" stroke="#3b5bdb" strokeWidth="2" />
            {fcPts && <polyline points={fcPts} fill="none" stroke="#e8590c" strokeWidth="2" strokeDasharray="5 4" />}
            {hist.map((p: any, i: number) => <circle key={"h" + i} cx={xj(i)} cy={yj(p.net)} r="3" fill="#3b5bdb" />)}
            {fc.map((p: any, i: number) => <circle key={"f" + i} cx={xj(hist.length + i)} cy={yj(p.net)} r="3" fill="#e8590c" />)}
            {series.map((p: any, i: number) => (
              <text key={"t" + i} x={xj(i)} y={CH - 8} fontSize="9" fill="#8b96a8" textAnchor="middle">{p.month.slice(5)}</text>
            ))}
          </svg>
          <p className="muted">Solid = actual net · dashed = projected (least-squares trend). Next 3 months: {fc.map((f: any) => "₹" + Math.round(f.net).toLocaleString("en-IN")).join(" · ")}</p>
        </div>
      )}

      <div className="panel">
        <h3>Add transaction</h3>
        <div className="row">
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="EXPENSE">Expense</option><option value="INCOME">Income</option>
          </select>
          <input placeholder="amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            <option value="">— category —</option>
            {cats.filter((c) => c.type === form.type).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input placeholder="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <button onClick={add}>Add</button>
        </div>
      </div>
    </div>
  );
}
