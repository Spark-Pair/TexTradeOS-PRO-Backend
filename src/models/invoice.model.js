import { db } from "../db/connection.js";
import { toInvoiceDto } from "../db/mappers.js";

export const InvoiceModel = {
  list(businessId, { customerName = "", dateFrom = "", dateTo = "" } = {}) {
    const conditions = ["invoices.business_id = ?"];
    const params = [businessId];
    if (customerName) { conditions.push("LOWER(invoices.customer_name) LIKE ?"); params.push(`%${customerName.toLowerCase()}%`); }
    if (dateFrom) { conditions.push("invoices.invoice_date >= ?"); params.push(dateFrom); }
    if (dateTo) { conditions.push("invoices.invoice_date <= ?"); params.push(dateTo); }
    return db.prepare(`SELECT invoices.*, (SELECT COUNT(*) FROM invoice_items WHERE invoice_id = invoices.id) AS order_count FROM invoices WHERE ${conditions.join(" AND ")} ORDER BY invoices.invoice_date DESC, invoices.id DESC`).all(...params).map((row) => toInvoiceDto(row));
  },
  find(id, businessId) { return db.prepare("SELECT * FROM invoices WHERE id = ? AND business_id = ?").get(id, businessId); },
  findAny(id) { return db.prepare("SELECT * FROM invoices WHERE id = ?").get(id); },
  allForLedger(businessId) { return db.prepare("SELECT * FROM invoices WHERE business_id = ? ORDER BY invoice_date DESC, id DESC").all(businessId); },
  items(invoiceId) { return db.prepare("SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position").all(invoiceId); },
  counterLast(businessId, year) { return db.prepare("SELECT MAX(CAST(SUBSTR(invoice_number, 6) AS INTEGER)) AS last_no FROM invoices WHERE business_id = ? AND invoice_number LIKE ?").get(businessId, `${year}-%`); },
  reserveArticleNumbers(businessId, count) {
    if (!count) return [];
    const row = db.prepare(`SELECT MAX(seq) AS seq FROM (
      SELECT CAST(SUBSTR(pi.article_no, 5) AS INTEGER) AS seq FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id WHERE p.business_id = ? AND pi.article_no LIKE 'ART-%'
      UNION ALL
      SELECT CAST(SUBSTR(ii.article_no, 5) AS INTEGER) AS seq FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id WHERE i.business_id = ? AND ii.article_no LIKE 'ART-%'
    )`).get(businessId, businessId);
    const counter = db.prepare("SELECT value FROM commerce_counters WHERE business_id = ? AND counter_key = 'article'").get(businessId);
    const first = Math.max(Number(row?.seq || 0), Number(counter?.value || 0)) + 1;
    const last = first + count - 1;
    db.prepare("INSERT INTO commerce_counters (business_id,counter_key,value) VALUES (?, 'article', ?) ON CONFLICT(business_id,counter_key) DO UPDATE SET value=excluded.value").run(businessId, last);
    return Array.from({ length: count }, (_, index) => `ART-${String(first + index).padStart(5, "0")}`);
  },
  businessCounter(businessId) { return db.prepare("SELECT invoice_counter_year, invoice_counter_last FROM businesses WHERE id = ?").get(businessId); },
  insert(values) { return db.prepare(`INSERT INTO invoices (business_id, created_by, invoice_number, invoice_date, customer_name, customer_urdu_title, salesman_name, customer_phone, customer_address, gross_amount, percent_discount_amount, rupee_discount_amount, total_discount_amount, net_amount, sales_return_amount, received_amount, balance_amount, return_amount, total_amount, customer_id, customer_kind, walk_in_person, payment_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...values); },
  insertItems(invoiceId, articles) { const insert=db.prepare(`INSERT INTO invoice_items (invoice_id, position, article_no, purchase_number, size, description, unit, quantity_pkt, dzn, pcs, purchase_rate, rate, gross_amount, discount, discount_type, discount_amount, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`); for(const article of articles) insert.run(invoiceId,article.position,article.article_no,article.purchase_number,article.size,article.description,article.unit,article.quantity_pkt,article.dzn,article.pcs,article.purchase_rate,article.rate,article.gross_amount,article.discount,article.discount_type,article.discount_amount,article.amount); },
  setSalesReturnAmount(id, amount) { db.prepare("UPDATE invoices SET sales_return_amount = ? WHERE id = ?").run(amount,id); },
  updateCounter(businessId, year, last, timestamp) { db.prepare("UPDATE businesses SET invoice_counter_year = ?, invoice_counter_last = ?, updated_at = ? WHERE id = ?").run(year,last,timestamp,businessId); },
  delete(id) { db.transaction(()=>{ db.prepare("DELETE FROM invoice_items WHERE invoice_id = ?").run(id); db.prepare("DELETE FROM invoices WHERE id = ?").run(id); }).immediate(); },
  transaction(fn) { return db.transaction(fn); },
};
