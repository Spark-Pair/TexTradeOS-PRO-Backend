import { db } from "../../db/connection.js";

const config = {
  customers: { table: "customers", name: "customer_name" },
  suppliers: { table: "suppliers", name: "supplier_name" },
};

const partyConfig = (kind) => {
  const value = config[kind];
  if (!value) throw new Error("Unsupported party type");
  return value;
};

const num = (value) => Number(value || 0);

const customerBalance = (businessId, id) => {
  const invoices = num(db.prepare("SELECT COALESCE(SUM(net_amount),0) amount FROM invoices WHERE business_id=? AND customer_id=?").get(businessId, String(id))?.amount);
  const payments = num(db.prepare("SELECT COALESCE(SUM(ip.amount),0) amount FROM invoice_payments ip JOIN invoices i ON i.id=ip.invoice_id WHERE ip.business_id=? AND i.customer_id=?").get(businessId, String(id))?.amount);
  const returns = num(db.prepare("SELECT COALESCE(SUM(total_amount),0) amount FROM returns WHERE business_id=? AND return_type='sales' AND party_id=?").get(businessId, String(id))?.amount);
  return { charges: invoices, credits: payments + returns, balance: invoices - payments - returns };
};

const supplierBalance = (businessId, id) => {
  const purchases = num(db.prepare("SELECT COALESCE(SUM(total_amount),0) amount FROM purchases WHERE business_id=? AND supplier_id=?").get(businessId, String(id))?.amount);
  const returns = num(db.prepare("SELECT COALESCE(SUM(total_amount),0) amount FROM returns WHERE business_id=? AND return_type='purchase' AND party_id=?").get(businessId, String(id))?.amount);
  return { charges: purchases, credits: returns, balance: purchases - returns };
};

export const getPartyBalance = (kind, businessId, id) => kind === "customers" ? customerBalance(businessId, id) : supplierBalance(businessId, id);

const allLedgerRows = (kind, businessId, id) => {
  if (kind === "customers") {
    const invoices = db.prepare("SELECT id,invoice_date date,invoice_number reference,net_amount amount FROM invoices WHERE business_id=? AND customer_id=?").all(businessId, String(id)).map((r) => ({ ...r, type: "invoice", description: "Sales Invoice", debit: num(r.amount), credit: 0 }));
    const payments = db.prepare(`SELECT ip.id,ip.payment_date date,i.invoice_number reference,ip.amount,ip.method,ip.reference_no,ip.notes FROM invoice_payments ip JOIN invoices i ON i.id=ip.invoice_id WHERE ip.business_id=? AND i.customer_id=?`).all(businessId, String(id)).map((r) => ({ ...r, type: "payment", description: `Payment Received${r.method ? ` · ${r.method}` : ""}`, debit: 0, credit: num(r.amount) }));
    const returns = db.prepare("SELECT id,return_date date,return_number reference,total_amount amount,total_pcs,notes FROM returns WHERE business_id=? AND return_type='sales' AND party_id=?").all(businessId, String(id)).map((r) => ({ ...r, type: "sales_return", description: "Sales Return", debit: 0, credit: num(r.amount) }));
    return [...invoices, ...payments, ...returns];
  }
  const purchases = db.prepare("SELECT id,purchase_date date,purchase_number reference,total_amount amount,article_count,packet_count,notes FROM purchases WHERE business_id=? AND supplier_id=?").all(businessId, String(id)).map((r) => ({ ...r, type: "purchase", description: "Purchase", debit: num(r.amount), credit: 0 }));
  const returns = db.prepare("SELECT id,return_date date,return_number reference,total_amount amount,total_pcs,stock_action,notes FROM returns WHERE business_id=? AND return_type='purchase' AND party_id=?").all(businessId, String(id)).map((r) => ({ ...r, type: "purchase_return", description: r.stock_action === "keep_goods" ? "Supplier Allowance / Keep Goods" : "Purchase Return", debit: 0, credit: num(r.amount) }));
  return [...purchases, ...returns];
};

export const getPartyLedger = (kind, businessId, id, filters = {}) => {
  const party = getParty(kind, businessId, id);
  if (!party) return null;
  const dateFrom = String(filters.date_from || "").slice(0, 10);
  const dateTo = String(filters.date_to || "").slice(0, 10);
  const allRows = allLedgerRows(kind, businessId, id).sort((a, b) => String(a.date).localeCompare(String(b.date)) || num(a.id) - num(b.id));
  const before = allRows.filter((row) => dateFrom && String(row.date).slice(0, 10) < dateFrom);
  const openingBalance = before.reduce((balance, row) => balance + num(row.debit) - num(row.credit), 0);
  const visible = allRows.filter((row) => (!dateFrom || String(row.date).slice(0, 10) >= dateFrom) && (!dateTo || String(row.date).slice(0, 10) <= dateTo));
  let running = openingBalance;
  const rows = visible.map((row) => { running += num(row.debit) - num(row.credit); return { ...row, running_balance: running }; });
  const periodTotals = rows.reduce((acc, row) => ({ debit: acc.debit + num(row.debit), credit: acc.credit + num(row.credit) }), { debit: 0, credit: 0 });
  return { rows, opening_balance: openingBalance, closing_balance: running, totals: { ...periodTotals, balance: running }, period: { date_from: dateFrom || null, date_to: dateTo || null, full_statement: !dateFrom && !dateTo } };
};

export const listParties = (kind, businessId) => {
  const { table } = partyConfig(kind);
  return db.prepare(`SELECT * FROM ${table} WHERE business_id = ? ORDER BY created_at DESC`).all(businessId);
};

export const getParty = (kind, businessId, id) => {
  const { table } = partyConfig(kind);
  return db.prepare(`SELECT * FROM ${table} WHERE business_id = ? AND id = ?`).get(businessId, id);
};

export const upsertParty = (kind, businessId, party) => {
  const { table, name } = partyConfig(kind);
  db.prepare(`
    INSERT INTO ${table} (id, business_id, ${name}, person_name, urdu_title, phone_number, address, city, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      ${name} = excluded.${name}, person_name = excluded.person_name, urdu_title = excluded.urdu_title,
      phone_number = excluded.phone_number, address = excluded.address, city = excluded.city,
      is_active = excluded.is_active, updated_at = excluded.updated_at
  `).run(party.id, businessId, party.name, party.person_name, party.urdu_title, party.phone_number, party.address, party.city, party.is_active ? 1 : 0, party.created_at, party.updated_at);
  return getParty(kind, businessId, party.id);
};

export const setPartyStatus = (kind, businessId, id, isActive, updatedAt) => {
  const { table } = partyConfig(kind);
  db.prepare(`UPDATE ${table} SET is_active = ?, updated_at = ? WHERE business_id = ? AND id = ?`).run(isActive ? 1 : 0, updatedAt, businessId, id);
  return getParty(kind, businessId, id);
};
