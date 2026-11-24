import { db } from "../../db/connection.js";

const select = `SELECT ba.*, CASE WHEN ba.category='customer' THEN c.customer_name WHEN ba.category='supplier' THEN s.supplier_name ELSE '' END party_name
  FROM bank_accounts ba LEFT JOIN customers c ON c.business_id=ba.business_id AND c.id=ba.party_id AND ba.category='customer'
  LEFT JOIN suppliers s ON s.business_id=ba.business_id AND s.id=ba.party_id AND ba.category='supplier'`;
export const listBankAccounts = (businessId) => db.prepare(`${select} WHERE ba.business_id=? ORDER BY ba.created_at DESC`).all(businessId);
export const getBankAccount = (businessId, id) => db.prepare(`${select} WHERE ba.business_id=? AND ba.id=?`).get(businessId, id);
export const getBankAccountLedger = (businessId, id, filters = {}) => {
  const account = getBankAccount(businessId, id);
  if (!account) return null;
  const payments = db.prepare(`SELECT id,COALESCE(NULLIF(clearing_date,''),payment_date) date,reference_no reference,method,amount,party_type,notes
    FROM party_payments WHERE business_id=? AND bank_account_id=?`).all(businessId, String(id)).map((row) => ({
    ...row,
    type: "payment",
    description: row.party_type === "customer" ? "Customer Payment Received" : "Supplier Payment Paid",
    debit: row.party_type === "customer" ? Number(row.amount || 0) : 0,
    credit: row.party_type === "supplier" ? Number(row.amount || 0) : 0,
  }));
  const entries = db.prepare(`SELECT id,entry_date date,reference,entry_type method,amount,direction,description,notes
    FROM balance_entries WHERE business_id=? AND entity_type='bank_account' AND entity_id=?`).all(businessId, String(id)).map((row) => ({
    ...row,
    type: "balance_entry",
    debit: row.direction === "debit" ? Number(row.amount || 0) : 0,
    credit: row.direction === "credit" ? Number(row.amount || 0) : 0,
  }));
  const allRows = [...payments, ...entries].sort((a, b) => String(a.date).localeCompare(String(b.date)) || Number(a.id) - Number(b.id) || String(a.type).localeCompare(String(b.type)));
  const dateFrom = String(filters.date_from || "").slice(0, 10);
  const dateTo = String(filters.date_to || "").slice(0, 10);
  const before = allRows.filter((row) => dateFrom && String(row.date).slice(0, 10) < dateFrom);
  const openingBalance = before.reduce((sum, row) => sum + Number(row.debit || 0) - Number(row.credit || 0), 0);
  const visible = allRows.filter((row) => (!dateFrom || String(row.date).slice(0, 10) >= dateFrom) && (!dateTo || String(row.date).slice(0, 10) <= dateTo));
  let running = openingBalance;
  const rows = visible.map((row) => {
    running += Number(row.debit || 0) - Number(row.credit || 0);
    return { ...row, running_balance: running };
  });
  const totals = rows.reduce((sum, row) => ({ debit: sum.debit + Number(row.debit || 0), credit: sum.credit + Number(row.credit || 0) }), { debit: 0, credit: 0 });
  return { account: { _id: account.id, account_title: account.account_title, account_no: account.account_no || "", bank_name: account.bank_name || "" }, rows, opening_balance: openingBalance, closing_balance: running, totals: { ...totals, balance: running }, period: { date_from: dateFrom || null, date_to: dateTo || null, full_statement: !dateFrom && !dateTo } };
};
export const getBankAccountBalance = (businessId, id) => getBankAccountLedger(businessId, id)?.closing_balance || 0;
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
