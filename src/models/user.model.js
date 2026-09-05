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

  updateShortcuts(id, shortcuts, updatedAt) {
    return db.prepare("UPDATE users SET shortcuts = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(shortcuts), updatedAt, id);
  },
};
