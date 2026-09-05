import bcrypt from "bcryptjs";
import { db, toUserDto } from "../db.js";
import { now, paginate } from "../utils.js";

const userSelect = `
  SELECT users.*, businesses.name AS business_name,
    (SELECT COUNT(*) FROM invoices WHERE invoices.created_by = users.id) AS created_invoice_count
  FROM users
  LEFT JOIN businesses ON businesses.id = users.business_id
`;

const filterUsers = (rows, query = {}) => {
  let filtered = [...rows];
  const name = String(query.name || "").toLowerCase().trim();
  const status = String(query.status || "").toLowerCase().trim();
  if (name) filtered = filtered.filter((row) => String(row.name || "").toLowerCase().includes(name));
  if (status === "active") filtered = filtered.filter((row) => row.isActive);
  if (status === "inactive") filtered = filtered.filter((row) => !row.isActive);
  return filtered;
};

const stats = (rows) => {
  const total = rows.length;
  const active = rows.filter((row) => Boolean(row.is_active)).length;
  return { success: true, data: { total, active, inactive: total - active } };
};

const findManagedUser = (id, businessId) => businessId
  ? db.prepare("SELECT * FROM users WHERE id = ? AND business_id = ? AND role <> 'developer'").get(id, businessId)
  : db.prepare("SELECT * FROM users WHERE id = ?").get(id);

const fail = (status, message) => Object.assign(new Error(message), { status });

export const UserService = {
  listAll(query) {
    const rows = db.prepare(`${userSelect} ORDER BY users.updated_at DESC`).all().map(toUserDto);
    return paginate(filterUsers(rows, query), query);
  },

  allStats() {
    return stats(db.prepare("SELECT is_active FROM users").all());
  },

  listBusiness(businessId, query) {
    const rows = db.prepare(`${userSelect} WHERE users.business_id = ? AND users.role <> 'developer' ORDER BY users.updated_at DESC`)
      .all(businessId).map(toUserDto);
    return paginate(filterUsers(rows, query), query);
  },

  businessStats(businessId) {
    return stats(db.prepare("SELECT is_active FROM users WHERE business_id = ? AND role <> 'developer'").all(businessId));
  },

  createBusinessUser(businessId, payload = {}) {
    const name = String(payload.name || "").trim();
    const username = String(payload.username || "").trim();
    const password = String(payload.password || "").trim();
    const role = String(payload.role || "staff").trim();
    if (!name || !username || !password) throw fail(400, "Name, username, and password are required");
    if (role === "developer") throw fail(400, "Cannot create developer users here");
    const timestamp = now();
    try {
      const result = db.prepare(`INSERT INTO users (business_id, name, username, password_hash, role, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`)
        .run(businessId, name, username, bcrypt.hashSync(password, 10), role, timestamp, timestamp);
      return { id: String(result.lastInsertRowid), success: true };
    } catch (error) {
      if (String(error.message).includes("UNIQUE")) throw fail(409, "Username already exists");
      throw error;
    }
  },

  toggleStatus(id, businessId = null) {
    const user = findManagedUser(id, businessId);
    if (!user) throw fail(404, "User not found");
    const next = user.is_active ? 0 : 1;
    db.prepare("UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?").run(next, now(), id);
    return { id: String(id), isActive: Boolean(next) };
  },

  resetPassword(id, password, businessId = null) {
    const cleanPassword = String(password || "").trim();
    if (!cleanPassword) throw fail(400, "New password is required");
    const user = findManagedUser(id, businessId);
    if (!user) throw fail(404, "User not found");
    db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
      .run(bcrypt.hashSync(cleanPassword, 10), now(), id);
    return { success: true };
  },

  delete(id, businessId, currentUserId) {
    if (String(id) === String(currentUserId)) throw fail(400, "You cannot delete your own user account");
    const user = findManagedUser(id, businessId);
    if (!user) throw fail(404, "User not found");
    const invoiceCount = db.prepare("SELECT COUNT(*) AS count FROM invoices WHERE created_by = ?").get(user.id).count;
    if (Number(invoiceCount) > 0) throw fail(409, "This user cannot be deleted because they have created invoices");
    db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
    return { success: true, id: String(user.id) };
  },

  activeSessions() {
    const rows = db.prepare(`SELECT users.id AS userId, users.name, users.username, COUNT(sessions.id) AS sessionCount, MAX(sessions.last_seen_at) AS lastSeenAt FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.revoked_at IS NULL GROUP BY users.id ORDER BY lastSeenAt DESC`).all();
    return { data: rows.map((row) => ({ ...row, userId: String(row.userId) })) };
  },

  revokeSessions(id) {
    db.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(now(), id);
    return { success: true };
  },
};
