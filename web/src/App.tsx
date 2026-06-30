import { useState } from "react";
import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import { api } from "./lib/api";
import PaymentsBoard from "./pages/PaymentsBoard";
import Budget from "./pages/Budget";
import Attendance from "./pages/Attendance";
import MyLeave from "./pages/MyLeave";

type User = { id: string; name: string; role: string } | null;

const NAV = [
  { to: "/payments", label: "Payments", roles: ["ADMIN", "FINANCE", "MANAGER"] },
  { to: "/budget", label: "Budget", roles: ["ADMIN", "FINANCE"] },
  { to: "/attendance", label: "Attendance", roles: ["ADMIN", "HR", "MANAGER"] },
  { to: "/my-leave", label: "My Leave", roles: ["ADMIN", "FINANCE", "MANAGER", "HR", "VIEWER"] },
];

function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [email, setEmail] = useState("admin@apophis.in");
  const [password, setPassword] = useState("password123");
  const [err, setErr] = useState("");
  const submit = async () => {
    try {
      const { token, user } = await api.post("/auth/login", { email, password });
      localStorage.setItem("token", token);
      onLogin(user);
    } catch (e: any) { setErr(e.message); }
  };
  return (
    <div className="login">
      <h1>Apophis SMM Suite</h1>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
      <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="password" />
      <button onClick={submit}>Sign in</button>
      {err && <p className="err">{err}</p>}
      <p className="hint">admin@ · finance@ · hr@ · or staff e.g. sneha@apophis.in — all password123</p>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User>(null);
  if (!user) return <Login onLogin={setUser} />;
  const items = NAV.filter((n) => n.roles.includes(user.role));

  return (
    <BrowserRouter>
      <div className="shell">
        <aside>
          <div className="brand">Apophis</div>
          {items.map((n) => <NavLink key={n.to} to={n.to}>{n.label}</NavLink>)}
          <div className="spacer" />
          <div className="role">{user.name} · {user.role}</div>
          <button className="link" onClick={() => { localStorage.removeItem("token"); setUser(null); }}>Sign out</button>
        </aside>
        <main>
          <Routes>
            <Route path="/payments" element={<PaymentsBoard />} />
            <Route path="/budget" element={<Budget />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/my-leave" element={<MyLeave />} />
            <Route path="*" element={<Navigate to={items[0]?.to ?? "/my-leave"} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
