import { db } from "../../db/connection.js";

const articlePurchaseMatch = "article_no = ? AND (purchase_number = ? OR COALESCE(purchase_number, '') = '')";
const nonReturnAdjustment = "COALESCE(reference_type, '') NOT IN ('sales_return', 'purchase_return')";

export function listInventory(businessId) {
  return db.prepare(`
    SELECT pi.article_no, pi.qr_id, pi.description, pi.size, pi.season, pi.category, pi.unit,
      pi.rate AS purchase_rate, pi.sale_rate, p.id AS purchase_id, p.purchase_number, p.purchase_date,
      p.supplier_id, p.supplier_name, pi.quantity_pcs AS purchased_pcs,
      COALESCE((SELECT SUM(ii.pcs) FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id WHERE i.business_id = p.business_id AND ii.article_no = pi.article_no AND (ii.purchase_number = p.purchase_number OR COALESCE(ii.purchase_number, '') = '')), 0) AS sold_pcs,
      COALESCE((SELECT SUM(ri.pcs) FROM return_items ri JOIN returns r ON r.id = ri.return_id WHERE r.business_id = p.business_id AND r.return_type = 'sales' AND r.stock_action = 'return_stock' AND ri.article_no = pi.article_no AND (ri.purchase_number = p.purchase_number OR COALESCE(ri.purchase_number, '') = '')), 0) AS sales_return_pcs,
      COALESCE((SELECT SUM(ri.pcs) FROM return_items ri JOIN returns r ON r.id = ri.return_id WHERE r.business_id = p.business_id AND r.return_type = 'purchase' AND r.stock_action = 'return_stock' AND ri.article_no = pi.article_no AND (ri.purchase_number = p.purchase_number OR COALESCE(ri.purchase_number, '') = '')), 0) AS purchase_return_pcs,
      COALESCE((SELECT SUM(im.pcs) FROM inventory_movements im WHERE im.business_id = p.business_id AND im.article_no = pi.article_no AND (im.purchase_number = p.purchase_number OR COALESCE(im.purchase_number, '') = '') AND ${nonReturnAdjustment}), 0) AS adjustment_pcs
    FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id
    WHERE p.business_id = ?

    UNION ALL

    SELECT ii.article_no, '' AS qr_id,
      COALESCE(MAX(ii.description), '') AS description,
      COALESCE(MAX(ii.size), '') AS size,
      '' AS season, '' AS category, COALESCE(MAX(ii.unit), 0) AS unit,
      COALESCE(MAX(ii.purchase_rate), 0) AS purchase_rate,
      COALESCE(MAX(ii.rate), 0) AS sale_rate,
      NULL AS purchase_id, '' AS purchase_number, MAX(i.invoice_date) AS purchase_date,
      '' AS supplier_id, 'Direct sale' AS supplier_name,
      COALESCE(SUM(ii.pcs), 0) AS purchased_pcs,
      COALESCE(SUM(ii.pcs), 0) AS sold_pcs,
      COALESCE((SELECT SUM(ri.pcs) FROM return_items ri JOIN returns r ON r.id = ri.return_id WHERE r.business_id = i.business_id AND r.return_type = 'sales' AND r.stock_action = 'return_stock' AND ri.article_no = ii.article_no AND COALESCE(ri.purchase_number, '') = ''), 0) AS sales_return_pcs,
      0 AS purchase_return_pcs,
      COALESCE((SELECT SUM(im.pcs) FROM inventory_movements im WHERE im.business_id = i.business_id AND im.article_no = ii.article_no AND COALESCE(im.purchase_number, '') = '' AND ${nonReturnAdjustment}), 0) AS adjustment_pcs
    FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
    WHERE i.business_id = ? AND COALESCE(ii.purchase_number, '') = '' AND TRIM(ii.article_no) <> ''
    GROUP BY i.business_id, ii.article_no

    ORDER BY purchase_date DESC, purchase_number DESC
  `).all(businessId, businessId);
}

export function listInventoryMovements(businessId, articleNo, purchaseNumber) {
  const purchase = db.prepare(`SELECT p.id AS reference_id, p.purchase_number AS reference, p.purchase_date AS date, p.supplier_name AS party, pi.quantity_pcs AS pcs, pi.rate AS rate FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id WHERE p.business_id = ? AND pi.article_no = ? AND p.purchase_number = ? LIMIT 1`).get(businessId, articleNo, purchaseNumber);
  const sales = db.prepare(`SELECT i.id AS reference_id, i.invoice_number AS reference, i.invoice_date AS date, i.customer_name AS party, ii.pcs, ii.rate FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id WHERE i.business_id = ? AND ii.${articlePurchaseMatch} ORDER BY i.invoice_date DESC, i.id DESC`).all(businessId, articleNo, purchaseNumber);
  const returns = db.prepare(`SELECT r.id AS reference_id, r.return_number AS reference, r.return_date AS date, r.party_name AS party, ri.pcs, ri.rate, r.return_type, r.stock_action FROM return_items ri JOIN returns r ON r.id = ri.return_id WHERE r.business_id = ? AND ri.${articlePurchaseMatch} ORDER BY r.return_date DESC, r.id DESC`).all(businessId, articleNo, purchaseNumber);
  const adjustments = db.prepare(`SELECT im.id AS reference_id, im.reference_id AS reference, im.created_at AS date, im.notes AS party, im.pcs, 0 AS rate, im.movement_type FROM inventory_movements im WHERE im.business_id = ? AND im.${articlePurchaseMatch} AND ${nonReturnAdjustment} ORDER BY im.created_at DESC, im.id DESC`).all(businessId, articleNo, purchaseNumber);
  return { purchase, sales, returns, adjustments };
}
