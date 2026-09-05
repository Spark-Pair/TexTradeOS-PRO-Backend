import { db } from "../../db/connection.js";

export const listPurchases = (businessId) => db.prepare("SELECT * FROM purchases WHERE business_id = ? ORDER BY purchase_date DESC, created_at DESC").all(businessId);
export const getPurchase = (businessId, id) => db.prepare("SELECT * FROM purchases WHERE business_id = ? AND id = ?").get(businessId, id);
export const getPurchaseItems = (id) => db.prepare("SELECT * FROM purchase_items WHERE purchase_id = ? ORDER BY position").all(id);

export const getArticleUsage = (businessId, articleNo, purchaseNumber) => {
  const invoiceRows = db.prepare(`SELECT i.id, i.invoice_number, i.invoice_date, i.customer_name, ii.pcs FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id WHERE i.business_id = ? AND ii.article_no = ? AND (ii.purchase_number = ? OR COALESCE(ii.purchase_number, '') = '') ORDER BY i.invoice_date DESC, i.id DESC`).all(businessId, articleNo, purchaseNumber);
  const returnRows = db.prepare(`SELECT r.id, r.return_number, r.return_date, r.return_type, r.stock_action, ri.pcs FROM return_items ri JOIN returns r ON r.id = ri.return_id WHERE r.business_id = ? AND ri.article_no = ? AND (ri.purchase_number = ? OR COALESCE(ri.purchase_number, '') = '') ORDER BY r.return_date DESC, r.id DESC`).all(businessId, articleNo, purchaseNumber);
  return { in_use: invoiceRows.length > 0 || returnRows.length > 0, invoice_count: invoiceRows.length, return_count: returnRows.length, invoices: invoiceRows, returns: returnRows };
};

const currentPurchaseSequence = (businessId, year) => {
  const row = db.prepare("SELECT purchase_number FROM purchases WHERE business_id = ? AND purchase_number LIKE ? ORDER BY CAST(SUBSTR(purchase_number, 8) AS INTEGER) DESC LIMIT 1").get(businessId, `P-${year}-%`);
  return Number(String(row?.purchase_number || "").split("-").pop()) || 0;
};
const currentArticleSequence = (businessId) => {
  const row = db.prepare(`SELECT MAX(CAST(SUBSTR(pi.article_no, 5) AS INTEGER)) AS seq FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id WHERE p.business_id = ? AND pi.article_no LIKE 'ART-%'`).get(businessId);
  return Number(row?.seq || 0);
};
const reserveCounter = (businessId, key, count, floor) => {
  const existing = db.prepare("SELECT value FROM commerce_counters WHERE business_id = ? AND counter_key = ?").get(businessId, key);
  const base = Math.max(Number(existing?.value || 0), Number(floor || 0));
  const next = base + count;
  db.prepare("INSERT INTO commerce_counters (business_id,counter_key,value) VALUES (?,?,?) ON CONFLICT(business_id,counter_key) DO UPDATE SET value=excluded.value").run(businessId, key, next);
  return { first: base + 1, last: next };
};

const assertUniqueArticleNumbers = (businessId, purchaseId, items) => {
  const seen = new Set();
  const findExisting = db.prepare(`SELECT p.purchase_number FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id WHERE p.business_id = ? AND pi.article_no = ? AND p.id <> ? LIMIT 1`);
  for (const item of items) {
    const articleNo = String(item.article_no || "").trim();
    if (!articleNo) continue;
    if (seen.has(articleNo)) throw Object.assign(new Error(`Article number ${articleNo} is duplicated in this purchase`), { statusCode: 409 });
    seen.add(articleNo);
    const existing = findExisting.get(businessId, articleNo, purchaseId);
    if (existing) throw Object.assign(new Error(`Article number ${articleNo} already exists in purchase ${existing.purchase_number}`), { statusCode: 409 });
  }
};

export const savePurchaseRecord = (businessId, userId, purchase, items, { allocateNumbers = false, year } = {}) => db.transaction(() => {
  let purchaseNumber = purchase.purchase_number;
  let normalizedItems = items;
  if (allocateNumbers) {
    const purchaseSeq = reserveCounter(businessId, `purchase:${year}`, 1, currentPurchaseSequence(businessId, year)).first;
    purchaseNumber = `P-${year}-${String(purchaseSeq).padStart(4, "0")}`;
    const missingCount = items.filter((item) => !item.article_no).length;
    let articleSeq = missingCount ? reserveCounter(businessId, "article", missingCount, currentArticleSequence(businessId)).first : 0;
    normalizedItems = items.map((item) => item.article_no ? item : { ...item, article_no: `ART-${String(articleSeq++).padStart(5, "0")}` });
  }
  assertUniqueArticleNumbers(businessId, purchase.id, normalizedItems);
  db.prepare(`INSERT INTO purchases (id,business_id,created_by,purchase_number,purchase_date,supplier_id,supplier_name,notes,total_amount,article_count,packet_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET purchase_date=excluded.purchase_date,supplier_id=excluded.supplier_id,supplier_name=excluded.supplier_name,notes=excluded.notes,total_amount=excluded.total_amount,article_count=excluded.article_count,packet_count=excluded.packet_count,updated_at=excluded.updated_at`).run(purchase.id,businessId,userId,purchaseNumber,purchase.purchase_date,purchase.supplier_id,purchase.supplier_name,purchase.notes,purchase.total_amount,normalizedItems.length,purchase.packet_count,purchase.created_at,purchase.updated_at);
  db.prepare("DELETE FROM purchase_items WHERE purchase_id = ?").run(purchase.id);
  const insert = db.prepare(`INSERT INTO purchase_items (purchase_id,position,article_no,qr_id,description,size,season,category,unit,quantity_dzn,quantity_pcs,quantity_pkt,rate,sale_rate,discount,discount_amount,amount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  normalizedItems.forEach((item,index) => insert.run(purchase.id,index,item.article_no,item.qr_id,item.description,item.size,item.season,item.category,item.unit,item.quantity_dzn,item.quantity_pcs,item.quantity_pkt,item.rate,item.sale_rate,item.discount,item.discount_amount,item.amount));
  return getPurchase(businessId, purchase.id);
})();

export const removePurchase = (businessId, id) => db.transaction(() => {
  const existing = getPurchase(businessId, id);
  if (!existing) return false;
  db.prepare("DELETE FROM purchases WHERE business_id = ? AND id = ?").run(businessId, id);
  return true;
})();
