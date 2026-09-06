import { db } from "../db/connection.js";

export const SessionModel = {
  create({ id, userId, refreshToken, userAgent, ip, createdAt }) { return db.prepare("INSERT INTO sessions (id, user_id, refresh_token, user_agent, ip, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, userId, refreshToken, userAgent, ip, createdAt, createdAt); },
  findActive(id, refreshToken) { return db.prepare("SELECT * FROM sessions WHERE id = ? AND refresh_token = ? AND revoked_at IS NULL").get(id, refreshToken); },
  touch(id, timestamp) { return db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(timestamp, id); },
  revoke(id, userId, timestamp) { return db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ?").run(timestamp, id, userId); },
  listActiveByUser() { return db.prepare("SELECT users.id AS userId, users.name, users.username, COUNT(sessions.id) AS sessionCount, MAX(sessions.last_seen_at) AS lastSeenAt FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.revoked_at IS NULL GROUP BY users.id ORDER BY lastSeenAt DESC").all(); },
  revokeAllForUser(userId, timestamp) { return db.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(timestamp, userId); },
};
