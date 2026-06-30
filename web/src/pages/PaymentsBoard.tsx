import { useEffect, useState } from "react";
import { api } from "../lib/api";

const COLS = [
  { key: "PENDING", label: "Pending" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "PAID", label: "Paid" },
  { key: "OVERDUE", label: "Overdue" },
];
const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

export default function PaymentsBoard() {
  const [data, setData] = useState<any>(null);
  const [reminders, setReminders] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = () => {
    api.get("/dashboard/payments").then(setData);
    api.get("/reminders").then(setReminders);
  };
  useEffect(load, []);
  if (!data) return <p>Loading…</p>;

  // latest sent reminder per invoice number
  const lastByInvoice: Record<string, any> = {};
  for (const r of reminders) {
    const num = r.invoice?.invoiceNumber;
    if (num && r.status === "SENT" && !lastByInvoice[num]) lastByInvoice[num] = r;
  }

  const run = async () => {
    setBusy(true); setNote("");
    try {
      const res = await api.post("/admin/run-reminders", {});
      setNote(`${res.sent.length} sent, ${res.skipped.length} skipped · ${res.mailMode === "preview" ? "preview mode (check API console)" : "sent via SMTP"}`);
      load();
    } catch (e: any) { setNote(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div className="pagehead">
        <h2>Payment follow-up</h2>
        <div className="row">
          <button onClick={run} disabled={busy}>{busy ? "Sending…" : "Send reminders"}</button>
          <button className="ghost" onClick={() => api.download("payments", "csv")}>CSV</button>
          <button className="ghost" onClick={() => api.download("payments", "pdf")}>PDF</button>
        </div>
      </div>
      {note && <p className="calc">{note}</p>}

      <div className="totals">
        <div><span>Outstanding</span><b>{inr(data.totals.outstanding)}</b></div>
        <div className="bad"><span>Overdue</span><b>{inr(data.totals.overdue)}</b></div>
        <div className="good"><span>Collected (mo)</span><b>{inr(data.totals.collectedThisMonth)}</b></div>
      </div>

      <div className="board">
        {COLS.map((c) => (
          <div key={c.key} className="col">
            <h3>{c.label} <em>{data.board[c.key].length}</em></h3>
            {data.board[c.key].map((i: any) => {
              const rem = lastByInvoice[i.invoiceNumber];
              return (
                <div key={i.id} className={"card s-" + c.key}>
                  <div className="card-top"><b>{i.client}</b><span>{i.invoiceNumber}</span></div>
                  <div className="amt">{inr(i.outstanding)} <small>of {inr(i.amount)}</small></div>
                  <div className="meta">due {new Date(i.dueDate).toLocaleDateString("en-IN")}</div>
                  {i.clientPhone && <div className="meta">{i.clientPhone}</div>}
                  {rem && <div className="remind">✓ {rem.kind.toLowerCase()} reminder sent {new Date(rem.sentAt).toLocaleDateString("en-IN")}</div>}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {reminders.length > 0 && (
        <div className="panel" style={{ marginTop: 18 }}>
          <h3>Recent reminders</h3>
          {reminders.slice(0, 8).map((r) => (
            <div key={r.id} className="reqrow">
              <span>{r.invoice?.client?.name} · {r.invoice?.invoiceNumber} · <small className="muted">{r.kind}</small></span>
              <em className={"pill " + (r.status === "SENT" ? "pill-ok" : r.status === "FAILED" ? "pill-no" : "pill-pending")}>{r.status}</em>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
