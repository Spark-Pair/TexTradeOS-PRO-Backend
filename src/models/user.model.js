import { db } from "../db.js";

const userSelect = `
  SELECT users.*, businesses.name AS business_name,
    (SELECT COUNT(*) FROM invoices WHERE invoices.created_by = users.id) AS created_invoice_count
  FROM users
  LEFT JOIN businesses ON businesses.id = users.business_id
`;

export const UserModel = {
  findByUsername(username) {
    return db.prepare(`${userSelect} WHERE users.username = ?`).get(username);
  },

  findById(id) {
    return db.prepare(`${userSelect} WHERE users.id = ?`).get(id);
  },

  listAll() {
    return db.prepare(`${userSelect} ORDER BY users.updated_at DESC`).all();
  },

  listByBusiness(businessId) {
    return db.prepare(`${userSelect} WHERE users.business_id = ? AND users.role <> 'developer' ORDER BY users.updated_at DESC`)
      .all(businessId);
  },

  statusRows(businessId = null) {
    if (businessId === null) return db.prepare("SELECT is_active FROM users").all();
    return db.prepare("SELECT is_active FROM users WHERE business_id = ? AND role <> 'developer'").all(businessId);
  },

  findManaged(id, businessId = null) {
    if (businessId === null) return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    return db.prepare("SELECT * FROM users WHERE id = ? AND business_id = ? AND role <> 'developer'").get(id, businessId);
  },

  create({ businessId, name, username, passwordHash, role, timestamp }) {
    return db.prepare(`
      INSERT INTO users (business_id, name, username, password_hash, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(businessId, name, username, passwordHash, role, timestamp, timestamp);
  },

  toggleStatus(id, isActive, timestamp) {
    return db.prepare("UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?")
      .run(isActive, timestamp, id);
  },

  updatePassword(id, passwordHash, timestamp) {
    return db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
      .run(passwordHash, timestamp, id);
  },

  updateShortcuts(id, shortcuts, updatedAt) {
    return db.prepare("UPDATE users SET shortcuts = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(shortcuts), updatedAt, id);
  },

  createdInvoiceCount(id) {
    return Number(db.prepare("SELECT COUNT(*) AS count FROM invoices WHERE created_by = ?").get(id)?.count || 0);
  },

  delete(id) {
    return db.prepare("DELETE FROM users WHERE id = ?").run(id);
  },
};
