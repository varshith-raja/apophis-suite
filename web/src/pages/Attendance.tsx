import { useEffect, useState } from "react";
import { api } from "../lib/api";

const FROM = "2026-06-01", TO = "2026-06-30";
const DAYS = Array.from({ length: 30 }, (_, i) => i + 1);
const SHORT: Record<string, string> = {
  PRESENT: "P", LATE: "L", ABSENT: "A", WFH: "WFH", CASUAL: "CL",
  SICK: "SL", PLANNED: "PL", COMP_OFF: "CO", LOP: "LOP", HOLIDAY: "H", EMERGENCY: "EM",
};

export default function Attendance() {
  const [recs, setRecs] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);

  const load = () => {
    api.get(`/attendance?from=${FROM}&to=${TO}`).then(setRecs);
    api.get("/leave-requests?status=PENDING").then(setPending);
  };
  useEffect(load, []);

  // group by employee
  const byUser: Record<string, { name: string; days: Record<number, string> }> = {};
  for (const r of recs) {
    const name = r.user?.name ?? r.userId;
    byUser[name] ??= { name, days: {} };
    byUser[name].days[new Date(r.date).getDate()] = r.status;
  }

  const approve = async (id: string) => { await api.patch(`/leave-requests/${id}/approve`); load(); };
  const reject = async (id: string) => { await api.patch(`/leave-requests/${id}/reject`); load(); };

  return (
    <div>
      <div className="pagehead">
        <h2>Attendance — June 2026</h2>
        <div className="row">
          <button className="ghost" onClick={() => api.download("attendance", "csv")}>CSV</button>
          <button className="ghost" onClick={() => api.download("attendance", "pdf")}>PDF</button>
          <button className="ghost" onClick={() => api.download("payroll", "pdf")}>Payroll PDF</button>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="panel">
          <h3>Leave approvals <em>{pending.length}</em></h3>
          {pending.map((p) => (
            <div key={p.id} className="approval">
              <span>{p.user?.name} · {p.leaveType?.name} · {p.days}d {p.shortNotice && <b className="warn">short notice</b>}</span>
              <span>
                <button onClick={() => approve(p.id)}>Approve</button>
                <button className="ghost" onClick={() => reject(p.id)}>Reject</button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="gridwrap">
        <table className="grid">
          <thead>
            <tr><th>Employee</th>{DAYS.map((d) => <th key={d}>{d}</th>)}</tr>
          </thead>
          <tbody>
            {Object.values(byUser).map((u) => (
              <tr key={u.name}>
                <td className="emp">{u.name}</td>
                {DAYS.map((d) => {
                  const s = u.days[d];
                  return <td key={d} className={"cell " + (s ? "st-" + s : "off")}>{s ? SHORT[s] : ""}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
