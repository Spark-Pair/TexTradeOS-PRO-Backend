import { listInventory, listInventoryMovements } from "./inventory.model.js";

const number = (value) => Number(value || 0);

export function getInventory(businessId) {
  return listInventory(businessId).map((row) => {
    const grossPurchasedPcs = number(row.purchased_pcs);
    const grossSoldPcs = number(row.sold_pcs);
    const salesReturnPcs = number(row.sales_return_pcs);
    const purchaseReturnPcs = number(row.purchase_return_pcs);
    const adjustmentPcs = number(row.adjustment_pcs);
    const netPurchasedPcs = Math.max(0, grossPurchasedPcs - purchaseReturnPcs);
    const netSoldPcs = Math.max(0, grossSoldPcs - salesReturnPcs);
    const stockPcs = Math.max(
      0,
      grossPurchasedPcs - grossSoldPcs + salesReturnPcs - purchaseReturnPcs + adjustmentPcs
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
      purchased_pcs: netPurchasedPcs,
      sold_pcs: netSoldPcs,
      gross_purchased_pcs: grossPurchasedPcs,
      gross_sold_pcs: grossSoldPcs,
      sales_return_pcs: salesReturnPcs,
      purchase_return_pcs: purchaseReturnPcs,
      adjustment_pcs: adjustmentPcs,
      stock_pcs: stockPcs,
      stock_dzn: stockPcs / 12,
      stock_pkt: unit > 0 ? stockPcs / unit : 0,
      available_packets: unit > 0 ? stockPcs / unit : 0,
    };
  });
}

export function getInventoryMovements(businessId, articleNo, purchaseNumber) {
  const data = listInventoryMovements(businessId, articleNo, purchaseNumber);
  const movements = [];

  if (data.purchase) {
    movements.push({
      key: `purchase-${data.purchase.reference_id}`,
      type: "Purchased",
      date: data.purchase.date,
      reference: data.purchase.reference,
      party: data.purchase.party || "Supplier",
      pcs: number(data.purchase.pcs),
      rate: number(data.purchase.rate),
    });
  }

  data.sales.forEach((row) => movements.push({
    key: `sale-${row.reference_id}`,
    type: "Sold",
    date: row.date,
    reference: row.reference,
    party: row.party || "Customer",
    pcs: number(row.pcs),
    rate: number(row.rate),
  }));

  data.returns.forEach((row) => movements.push({
    key: `return-${row.return_type}-${row.reference_id}`,
    type: row.return_type === "sales" ? "Sales Return" : "Purchase Return",
    date: row.date,
    reference: row.reference,
    party: row.party || "",
    pcs: row.return_type === "sales" ? number(row.pcs) : -number(row.pcs),
    rate: number(row.rate),
    stock_action: row.stock_action,
  }));

  data.adjustments.forEach((row) => movements.push({
    key: `adjustment-${row.reference_id}`,
    type: row.movement_type || "Adjustment",
    date: row.date,
    reference: row.reference || "Stock Adjustment",
    party: row.party || "",
    pcs: number(row.pcs),
    rate: 0,
  }));

  return movements.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}
