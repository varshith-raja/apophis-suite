import { useEffect, useState } from "react";
import { api } from "../lib/api";

// inclusive working days between two dates, excluding Sundays
function workingDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start), e = new Date(end);
  if (e < s) return 0;
  let n = 0;
  for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) if (d.getDay() !== 0) n++;
  return n;
}

const STATUS_CLASS: Record<string, string> = { PENDING: "pill-pending", APPROVED: "pill-ok", REJECTED: "pill-no" };

export default function MyLeave() {
  const [balances, setBalances] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [reqs, setReqs] = useState<any[]>([]);
  const [form, setForm] = useState({ leaveTypeId: "", mode: "NORMAL", startDate: "", endDate: "" });
  const [msg, setMsg] = useState("");

  const load = () => {
    api.get("/my/balances").then(setBalances);
    api.get("/my/leave-requests").then(setReqs);
  };
  useEffect(() => {
    load();
    api.get("/leave-types").then((t) => { setTypes(t); setForm((f) => ({ ...f, leaveTypeId: t[0]?.id ?? "" })); });
  }, []);

  const days = workingDays(form.startDate, form.endDate);
  const selected = types.find((t) => t.id === form.leaveTypeId);
  const casualBal = balances.find((b) => b.leaveTypeId === form.leaveTypeId)?.available ?? 0;
  const willLop = selected?.policyType === "ACCRUAL_LOT" ? Math.max(0, days - casualBal) : 0;

  const submit = async () => {
    setMsg("");
    if (!days) { setMsg("Pick a valid date range."); return; }
    try {
      await api.post("/leave-requests", { ...form, days });
      setForm({ ...form, startDate: "", endDate: "" });
      setMsg("Request submitted.");
      load();
    } catch (e: any) { setMsg(e.message); }
  };

  return (
    <div>
      <div className="pagehead"><h2>My leave</h2></div>

      <div className="panel">
        <h3>Balances</h3>
        {balances.length === 0 && <p className="muted">No accruing balances yet.</p>}
        {balances.map((b) => (
          <div key={b.leaveTypeId} className="balrow">
            {b.kind === "QUOTA" ? (
              <>
                <div className="balhead"><b>{b.leaveType}</b><span className="big">{b.used}/{b.limit} used this month</span></div>
                <div className="quotabar"><div className="quotafill" style={{ width: `${Math.min(100, (b.used / Math.max(b.limit, 1)) * 100)}%` }} /></div>
                <span className="muted">{Math.max(0, b.limit - b.used)} left · up to {b.maxLimit} with merit</span>
              </>
            ) : (
              <>
                <div className="balhead"><b>{b.leaveType}</b><span className="big">{b.available} day{b.available === 1 ? "" : "s"} available</span></div>
                <div className="lots">
                  {b.lots.filter((l: any) => Number(l.amount) - Number(l.used) > 0).map((l: any) => (
                    <span key={l.id} className="lot">
                      {Number(l.amount) - Number(l.used)}d · expires {new Date(l.expiresOn).toLocaleDateString("en-IN", { month: "short", year: "2-digit" })}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
        <p className="muted">Sick: first day of an occurrence is paid; further days are LOP unless casual remains. WFH: 2/month (up to 4 on merit).</p>
      </div>

      <div className="panel">
        <h3>Request leave</h3>
        <div className="row">
          <select value={form.leaveTypeId} onChange={(e) => setForm({ ...form, leaveTypeId: e.target.value })}>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
            <option value="NORMAL">Normal</option>
            <option value="PLANNED">Planned (notify by 25th)</option>
          </select>
          <label className="datefield">From <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
          <label className="datefield">To <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
          <button onClick={submit}>Submit</button>
        </div>
        {days > 0 && (
          <p className="calc">
            {days} working day{days === 1 ? "" : "s"} (Sundays excluded).
            {willLop > 0 && <b className="warn"> {willLop} day{willLop === 1 ? "" : "s"} will be LOP — exceeds your {casualBal}-day balance.</b>}
          </p>
        )}
        {msg && <p className="calc">{msg}</p>}
      </div>

      <div className="panel">
        <h3>My requests</h3>
        {reqs.length === 0 && <p className="muted">Nothing yet.</p>}
        {reqs.map((r) => (
          <div key={r.id} className="reqrow">
            <span>{r.leaveType?.name} · {r.days}d · {new Date(r.startDate).toLocaleDateString("en-IN")}–{new Date(r.endDate).toLocaleDateString("en-IN")}
              {r.shortNotice && <b className="warn"> short notice</b>}</span>
            <span>
              {r.status === "APPROVED" && r.lopDays > 0 && <small className="muted">{r.paidDays} paid · {r.lopDays} LOP </small>}
              <em className={"pill " + (STATUS_CLASS[r.status] ?? "")}>{r.status}</em>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
