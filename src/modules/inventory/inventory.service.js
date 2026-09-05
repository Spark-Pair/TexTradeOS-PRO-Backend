import { listInventory } from "./inventory.model.js";

const number = (value) => Number(value || 0);

export function getInventory(businessId) {
  return listInventory(businessId).map((row) => {
    const stockPcs = Math.max(
      0,
      number(row.purchased_pcs)
        - number(row.sold_pcs)
        + number(row.sales_return_pcs)
        - number(row.purchase_return_pcs)
        + number(row.adjustment_pcs)
    );
    const unit = number(row.unit);

    return {
      article_no: row.article_no,
      qr_id: row.qr_id,
      description: row.description || "",
      size: row.size || "",
      season: row.season || "",
      category: row.category || "",
      unit,
      purchase_rate: number(row.purchase_rate),
      sale_rate: number(row.sale_rate),
      purchase_id: row.purchase_id,
      purchase_number: row.purchase_number,
      purchase_date: row.purchase_date,
      supplier_id: row.supplier_id || "",
      supplier_name: row.supplier_name || "",
      purchased_pcs: number(row.purchased_pcs),
      sold_pcs: number(row.sold_pcs),
      sales_return_pcs: number(row.sales_return_pcs),
      purchase_return_pcs: number(row.purchase_return_pcs),
      adjustment_pcs: number(row.adjustment_pcs),
      stock_pcs: stockPcs,
      available_packets: unit > 0 ? stockPcs / unit : 0,
    };
  });
}
