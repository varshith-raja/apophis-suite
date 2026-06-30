import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { signToken, requireAuth, AuthedReq } from "../middleware/auth";

const r = Router();

r.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password ?? "", user.passwordHash)))
    return res.status(401).json({ error: "Invalid credentials" });
  const payload = { id: user.id, role: user.role, name: user.name };
  res.json({ token: signToken(payload), user: payload });
});

r.get("/me", requireAuth, (req: AuthedReq, res) => res.json(req.user));

export default r;
