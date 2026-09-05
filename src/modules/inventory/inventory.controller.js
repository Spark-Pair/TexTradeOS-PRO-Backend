import { getInventory, getInventoryMovements } from "./inventory.service.js";

const send = (res, action) => {
  try { return action(); }
  catch (error) { return res.status(error.statusCode || 500).json({ message: error.message || "Inventory operation failed" }); }
};

export const InventoryController = {
  list(req, res) {
    return send(res, () => res.json({ success: true, data: getInventory(req.user.business_id) }));
  },
  movements(req, res) {
    return send(res, () => {
      const articleNo = String(req.params.articleNo || "").trim();
      const purchaseNumber = String(req.query.purchase_number || "").trim();
      if (!articleNo) return res.status(400).json({ message: "article number is required" });
      if (!purchaseNumber) return res.status(400).json({ message: "purchase_number is required" });
      return res.json({ success: true, data: getInventoryMovements(req.user.business_id, articleNo, purchaseNumber) });
    });
  },
};
