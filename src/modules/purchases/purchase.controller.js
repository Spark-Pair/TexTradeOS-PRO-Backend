import { getArticleUsage } from "./purchase.model.js";
import { deletePurchase, getPurchaseDto, listPurchaseDtos, savePurchase } from "./purchase.service.js";

const send = (res, action) => {
  try { return action(); }
  catch (error) { return res.status(error.statusCode || 500).json({ message: error.message || "Purchase operation failed" }); }
};

export const PurchaseController = {
  list: (req, res) => send(res, () => res.json({ success: true, data: listPurchaseDtos(req.user.business_id) })),
  get: (req, res) => send(res, () => {
    const data = getPurchaseDto(req.user.business_id, req.params.id);
    return data ? res.json({ success: true, data }) : res.status(404).json({ message: "Purchase not found" });
  }),
  articleUsage: (req, res) => send(res, () => {
    const articleNo = String(req.params.articleNo || "").trim();
    const purchaseNumber = String(req.query.purchase_number || "").trim();
    if (!articleNo) return res.status(400).json({ message: "article number is required" });
    if (!purchaseNumber) return res.status(400).json({ message: "purchase_number is required" });
    return res.json({ success: true, data: getArticleUsage(req.user.business_id, articleNo, purchaseNumber) });
  }),
  create: (req, res) => send(res, () => res.status(201).json({ success: true, data: savePurchase(req.user.business_id, req.user.id, req.body) })),
  update: (req, res) => send(res, () => res.json({ success: true, data: savePurchase(req.user.business_id, req.user.id, req.body, req.params.id) })),
  delete: (req, res) => send(res, () => {
    deletePurchase(req.user.business_id, req.params.id);
    return res.json({ success: true });
  }),
};
