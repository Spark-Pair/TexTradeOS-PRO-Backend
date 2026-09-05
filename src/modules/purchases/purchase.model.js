import { db } from "../../db.js";

export const listPurchases = (businessId) => db.prepare("SELECT * FROM purchases WHERE business_id = ? ORDER BY purchase_date DESC, created_at DESC").all(businessId);
export const getPurchase = (businessId, id) => db.prepare("SELECT * FROM purchases WHERE business_id = ? AND id = ?").get(businessId, id);
export const getPurchaseItems = (id) => db.prepare("SELECT * FROM purchase_items WHERE purchase_id = ? ORDER BY position").all(id);
export const lastPurchaseSequence = (businessId, year) => {
  const row = db.prepare("SELECT purchase_number FROM purchases WHERE business_id = ? AND purchase_number LIKE ? ORDER BY CAST(SUBSTR(purchase_number, 8) AS INTEGER) DESC LIMIT 1").get(businessId, `P-${year}-%`);
  return Number(String(row?.purchase_number || "").split("-").pop()) || 0;
};
export const highestArticleSequence = (businessId) => {
  const row = db.prepare(`SELECT MAX(CAST(SUBSTR(pi.article_no, 5) AS INTEGER)) AS seq FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id WHERE p.business_id = ? AND pi.article_no LIKE 'ART-%'`).get(businessId);
  return Number(row?.seq || 0);
};

export const savePurchaseRecord = (businessId, userId, purchase, items) => db.transaction(() => {
  db.prepare(`INSERT INTO purchases (id,business_id,created_by,purchase_number,purchase_date,supplier_id,supplier_name,notes,total_amount,article_count,packet_count,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET purchase_date=excluded.purchase_date,supplier_id=excluded.supplier_id,supplier_name=excluded.supplier_name,notes=excluded.notes,total_amount=excluded.total_amount,article_count=excluded.article_count,packet_count=excluded.packet_count,updated_at=excluded.updated_at`)
    .run(purchase.id,businessId,userId,purchase.purchase_number,purchase.purchase_date,purchase.supplier_id,purchase.supplier_name,purchase.notes,purchase.total_amount,items.length,purchase.packet_count,purchase.created_at,purchase.updated_at);
  db.prepare("DELETE FROM purchase_items WHERE purchase_id = ?").run(purchase.id);
  const insert = db.prepare(`INSERT INTO purchase_items (purchase_id,position,article_no,qr_id,description,size,season,category,unit,quantity_dzn,quantity_pcs,quantity_pkt,rate,sale_rate,discount,discount_amount,amount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  items.forEach((item,index) => insert.run(purchase.id,index,item.article_no,item.qr_id,item.description,item.size,item.season,item.category,item.unit,item.quantity_dzn,item.quantity_pcs,item.quantity_pkt,item.rate,item.sale_rate,item.discount,item.discount_amount,item.amount));
  return getPurchase(businessId, purchase.id);
})();

export const removePurchase = (businessId, id) => db.transaction(() => {
  const existing = getPurchase(businessId, id);
  if (!existing) return false;
  db.prepare("DELETE FROM purchases WHERE business_id = ? AND id = ?").run(businessId, id);
  return true;
})();
