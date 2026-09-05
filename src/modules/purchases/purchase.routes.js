import express from "express";
import { getArticleUsage } from "./purchase.model.js";
import { deletePurchase, getPurchaseDto, listPurchaseDtos, savePurchase } from "./purchase.service.js";

const run = (res, action) => { try { return action(); } catch (error) { return res.status(error.statusCode || 500).json({ message: error.message || "Request failed" }); } };
export function createPurchaseRouter(requireAuth) {
  const router = express.Router();
  router.use(requireAuth);
  router.get("/", (req, res) => run(res, () => res.json({ success: true, data: listPurchaseDtos(req.user.business_id) })));
  router.get("/articles/:articleNo/usage", (req, res) => run(res, () => {
    const purchaseNumber = String(req.query.purchase_number || "").trim();
    if (!purchaseNumber) return res.status(400).json({ message: "purchase_number is required" });
    return res.json({ success: true, data: getArticleUsage(req.user.business_id, String(req.params.articleNo || "").trim(), purchaseNumber) });
  }));
  router.get("/:id", (req, res) => run(res, () => { const data = getPurchaseDto(req.user.business_id, req.params.id); return data ? res.json({ success: true, data }) : res.status(404).json({ message: "Purchase not found" }); }));
  router.post("/", (req, res) => run(res, () => res.status(201).json({ success: true, data: savePurchase(req.user.business_id, req.user.id, req.body) })));
  router.put("/:id", (req, res) => run(res, () => res.json({ success: true, data: savePurchase(req.user.business_id, req.user.id, req.body, req.params.id) })));
  router.delete("/:id", (req, res) => run(res, () => { deletePurchase(req.user.business_id, req.params.id); return res.json({ success: true }); }));
  return router;
}
