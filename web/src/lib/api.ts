const BASE = "http://localhost:4000";
const token = () => localStorage.getItem("token") || "";

async function req(path: string, opts: RequestInit = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}`, ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.status === 204 ? null : res.json();
}

export const api = {
  get: (p: string) => req(p),
  post: (p: string, b: any) => req(p, { method: "POST", body: JSON.stringify(b) }),
  patch: (p: string, b?: any) => req(p, { method: "PATCH", body: JSON.stringify(b ?? {}) }),
  // Authenticated file download (CSV or PDF) via blob.
  async download(module: string, fmt: "csv" | "pdf" = "csv") {
    const res = await fetch(`${BASE}/reports/${module}/export?format=${fmt}`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${module}.${fmt}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
