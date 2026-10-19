import { db } from "../db/connection.js";

const userSelect = `SELECT users.*, businesses.name AS business_name, businesses.person AS business_person, businesses.phone AS business_phone, businesses.email AS business_email, businesses.address AS business_address, businesses.urdu_name AS business_urdu_name, businesses.tax_number AS business_tax_number, (SELECT COUNT(*) FROM invoices WHERE invoices.created_by = users.id) AS created_invoice_count FROM users LEFT JOIN businesses ON businesses.id = users.business_id`;
const authenticatedUserSelect = userSelect.replace("businesses.tax_number AS business_tax_number", "businesses.tax_number AS business_tax_number, businesses.invoice_banner_data AS business_invoice_banner_data");
export const UserModel = {
  findByUsername(username) { return db.prepare(`${authenticatedUserSelect} WHERE users.username = ?`).get(username); },
  findById(id) { return db.prepare(`${authenticatedUserSelect} WHERE users.id = ?`).get(id); },
  listAll() { return db.prepare(`${userSelect} ORDER BY users.updated_at DESC`).all(); },
  listByBusiness(businessId) { return db.prepare(`${userSelect} WHERE users.business_id = ? AND users.role <> 'developer' ORDER BY users.updated_at DESC`).all(businessId); },
  statusRows(businessId = null) { return businessId === null ? db.prepare("SELECT is_active FROM users").all() : db.prepare("SELECT is_active FROM users WHERE business_id = ? AND role <> 'developer'").all(businessId); },
  findManaged(id, businessId = null) { return businessId === null ? db.prepare("SELECT * FROM users WHERE id = ?").get(id) : db.prepare("SELECT * FROM users WHERE id = ? AND business_id = ? AND role <> 'developer'").get(id, businessId); },
  create({ businessId, name, username, passwordHash, role, timestamp }) { return db.prepare("INSERT INTO users (business_id, name, username, password_hash, role, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").run(businessId, name, username, passwordHash, role, timestamp, timestamp); },
  toggleStatus(id, isActive, timestamp) { return db.prepare("UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?").run(isActive, timestamp, id); },
  updatePassword(id, passwordHash, timestamp) { return db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(passwordHash, timestamp, id); },
  updateShortcuts(id, shortcuts, updatedAt) { return db.prepare("UPDATE users SET shortcuts = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(shortcuts), updatedAt, id); },
  createdInvoiceCount(id) { return Number(db.prepare("SELECT COUNT(*) AS count FROM invoices WHERE created_by = ?").get(id)?.count || 0); },
  delete(id) { return db.prepare("DELETE FROM users WHERE id = ?").run(id); },
};
