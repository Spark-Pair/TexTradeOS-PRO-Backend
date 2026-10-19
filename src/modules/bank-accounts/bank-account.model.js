import { db } from "../../db/connection.js";

const select = `SELECT ba.*, CASE WHEN ba.category='customer' THEN c.customer_name WHEN ba.category='supplier' THEN s.supplier_name ELSE '' END party_name
  FROM bank_accounts ba LEFT JOIN customers c ON c.business_id=ba.business_id AND c.id=ba.party_id AND ba.category='customer'
  LEFT JOIN suppliers s ON s.business_id=ba.business_id AND s.id=ba.party_id AND ba.category='supplier'`;
export const listBankAccounts = (businessId) => db.prepare(`${select} WHERE ba.business_id=? ORDER BY ba.created_at DESC`).all(businessId);
export const getBankAccount = (businessId, id) => db.prepare(`${select} WHERE ba.business_id=? AND ba.id=?`).get(businessId, id);
export const saveBankAccount = (account) => {
  db.prepare(`INSERT INTO bank_accounts (id,business_id,category,party_id,account_title,account_no,bank_name,cheque_serial_start,cheque_serial_end,is_active,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET category=excluded.category,party_id=excluded.party_id,account_title=excluded.account_title,account_no=excluded.account_no,bank_name=excluded.bank_name,cheque_serial_start=excluded.cheque_serial_start,cheque_serial_end=excluded.cheque_serial_end,is_active=excluded.is_active,updated_at=excluded.updated_at`).run(
    account.id, account.business_id, account.category, account.party_id, account.account_title, account.account_no, account.bank_name,
    account.cheque_serial_start, account.cheque_serial_end, account.is_active ? 1 : 0, account.created_at, account.updated_at,
  );
  return getBankAccount(account.business_id, account.id);
};
export const setBankAccountStatus = (businessId, id, isActive, updatedAt) => {
  db.prepare("UPDATE bank_accounts SET is_active=?,updated_at=? WHERE business_id=? AND id=?").run(isActive ? 1 : 0, updatedAt, businessId, id);
  return getBankAccount(businessId, id);
};
