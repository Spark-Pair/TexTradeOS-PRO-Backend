import { db } from "../../db.js";

export function listInventory(businessId) {
  return db.prepare(`
    SELECT
      pi.article_no,
      pi.qr_id,
      pi.description,
      pi.size,
      pi.season,
      pi.category,
      pi.unit,
      pi.rate AS purchase_rate,
      pi.sale_rate,
      p.id AS purchase_id,
      p.purchase_number,
      p.purchase_date,
      p.supplier_id,
      p.supplier_name,
      pi.quantity_pcs AS purchased_pcs,
      COALESCE((
        SELECT SUM(ii.pcs)
        FROM invoice_items ii
        JOIN invoices i ON i.id = ii.invoice_id
        WHERE i.business_id = p.business_id
          AND ii.article_no = pi.article_no
          AND (ii.purchase_number = p.purchase_number OR COALESCE(ii.purchase_number, '') = '')
      ), 0) AS sold_pcs,
      COALESCE((
        SELECT SUM(ri.pcs)
        FROM return_items ri
        JOIN returns r ON r.id = ri.return_id
        WHERE r.business_id = p.business_id
          AND r.return_type = 'sales'
          AND r.stock_action = 'return_stock'
          AND ri.article_no = pi.article_no
          AND (ri.purchase_number = p.purchase_number OR COALESCE(ri.purchase_number, '') = '')
      ), 0) AS sales_return_pcs,
      COALESCE((
        SELECT SUM(ri.pcs)
        FROM return_items ri
        JOIN returns r ON r.id = ri.return_id
        WHERE r.business_id = p.business_id
          AND r.return_type = 'purchase'
          AND r.stock_action = 'return_stock'
          AND ri.article_no = pi.article_no
          AND (ri.purchase_number = p.purchase_number OR COALESCE(ri.purchase_number, '') = '')
      ), 0) AS purchase_return_pcs,
      COALESCE((
        SELECT SUM(im.pcs)
        FROM inventory_movements im
        WHERE im.business_id = p.business_id
          AND im.article_no = pi.article_no
          AND (im.purchase_number = p.purchase_number OR COALESCE(im.purchase_number, '') = '')
      ), 0) AS adjustment_pcs
    FROM purchase_items pi
    JOIN purchases p ON p.id = pi.purchase_id
    WHERE p.business_id = ?
    ORDER BY p.purchase_date DESC, p.purchase_number DESC, pi.position ASC
  `).all(businessId);
}
