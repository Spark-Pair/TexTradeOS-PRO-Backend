import { db } from "../../db/connection.js";

const select = `SELECT be.*, u.name created_by_name,
  CASE be.entity_type
    WHEN 'customer' THEN c.customer_name
    WHEN 'supplier' THEN s.supplier_name
    ELSE ba.account_title
  END entity_name,
  CASE WHEN be.entity_type='bank_account' THEN ba.bank_name ELSE '' END bank_name
  FROM balance_entries be
  LEFT JOIN users u ON u.id=be.created_by
  LEFT JOIN customers c ON be.entity_type='customer' AND c.business_id=be.business_id AND c.id=be.entity_id
  LEFT JOIN suppliers s ON be.entity_type='supplier' AND s.business_id=be.business_id AND s.id=be.entity_id
  LEFT JOIN bank_accounts ba ON be.entity_type='bank_account' AND ba.business_id=be.business_id AND ba.id=be.entity_id`;

export const listBalanceEntries = (businessId) =>
  db.prepare(`${select} WHERE be.business_id=? ORDER BY be.entry_date DESC,be.id DESC`).all(businessId);

export const getBalanceEntry = (businessId, id) =>
  db.prepare(`${select} WHERE be.business_id=? AND be.id=?`).get(businessId, id);

export const hasOpeningBalanceEntry = (businessId, entityType, entityId) =>
  Boolean(db.prepare("SELECT id FROM balance_entries WHERE business_id=? AND entity_type=? AND entity_id=? AND entry_type='opening'").get(businessId, entityType, entityId));

export const insertBalanceEntry = (entry) => {
  const result = db.prepare(`INSERT INTO balance_entries
    (business_id,created_by,entity_type,entity_id,entry_type,entry_date,direction,amount,reference,description,notes,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    entry.business_id, entry.created_by, entry.entity_type, entry.entity_id,
    entry.entry_type, entry.entry_date, entry.direction, entry.amount,
    entry.reference, entry.description, entry.notes, entry.created_at, entry.updated_at,
  );
  return getBalanceEntry(entry.business_id, result.lastInsertRowid);
};
