import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { db, toUserDto } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "dev-refresh-secret";

export const signAccessToken = (user) =>
  jwt.sign({ sub: String(user.id), role: user.role }, JWT_SECRET, { expiresIn: "2h" });

export const signRefreshToken = (user, sessionId) =>
  jwt.sign({ sub: String(user.id), sid: sessionId }, JWT_REFRESH_SECRET, { expiresIn: "30d" });

export const newSessionId = () => crypto.randomUUID();

export const getUserById = (id) =>
  db.prepare(`
    SELECT users.*, businesses.name AS business_name
    FROM users
    LEFT JOIN businesses ON businesses.id = users.business_id
    WHERE users.id = ?
  `).get(id);

export const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ message: "Missing token" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = getUserById(payload.sub);
    if (!user || !user.is_active) return res.status(401).json({ message: "Invalid user" });

    req.user = user;
    req.userDto = toUserDto(user);
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};

export const requireDeveloper = (req, res, next) => {
  if (req.user?.role !== "developer") return res.status(403).json({ message: "Developer access required" });
  next();
};

export const requireBusinessAdmin = (req, res, next) => {
  if (req.user?.role === "developer" || req.user?.role === "admin") return next();
  res.status(403).json({ message: "Admin access required" });
};
