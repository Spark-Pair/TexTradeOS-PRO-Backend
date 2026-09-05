import { AuthService } from "../services/auth.service.js";

export const AuthController = {
  login(req, res) {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");
    if (!username || !password) return res.status(400).json({ message: "Username and password are required" });
    try {
      res.json(AuthService.login({ username, password, userAgent: req.headers["user-agent"] || "", ip: req.ip || "" }));
    } catch (error) {
      res.status(error.status || 500).json({ message: error.message || "Login failed" });
    }
  },

  me(req, res) {
    res.json({ user: req.userDto });
  },

  logout(req, res) {
    const sessionId = String(req.body?.sessionId || req.headers["x-session-id"] || "");
    res.json(AuthService.logout({ sessionId, userId: req.user.id }));
  },

  updateShortcuts(req, res) {
    const shortcuts = req.body?.shortcuts && typeof req.body.shortcuts === "object" ? req.body.shortcuts : {};
    res.json(AuthService.updateShortcuts({ userId: req.user.id, shortcuts }));
  },

  refresh(req, res) {
    try {
      res.json(AuthService.refresh({
        refreshToken: String(req.body?.refreshToken || ""),
        sessionId: String(req.body?.sessionId || ""),
      }));
    } catch {
      res.status(401).json({ message: "Invalid refresh token" });
    }
  },
};
