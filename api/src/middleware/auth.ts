import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export interface AuthedReq extends Request {
  user?: { id: string; role: string; name: string };
}

export const signToken = (u: { id: string; role: string; name: string }) =>
  jwt.sign(u, SECRET, { expiresIn: "7d" });

export const requireAuth = (req: AuthedReq, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    req.user = jwt.verify(token, SECRET) as AuthedReq["user"];
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
};

export const requireRole =
  (...roles: string[]) =>
  (req: AuthedReq, res: Response, next: NextFunction) =>
    roles.includes(req.user?.role ?? "") ? next() : res.status(403).json({ error: "Forbidden" });
