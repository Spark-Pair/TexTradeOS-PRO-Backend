import { SharedDataModel } from "../models/shared-data.model.js";

const SHARED_COLLECTIONS = new Set(["suppliers", "customers", "purchases"]);

export const SharedDataController = {
  list(req, res) {
    res.json({ success: true, data: SharedDataModel.all(req.user.business_id) });
  },

  save(req, res) {
    const collection = String(req.params.collection || "").trim().toLowerCase();
    if (!SHARED_COLLECTIONS.has(collection)) return res.status(400).json({ message: "Unsupported shared collection" });
    if (!Array.isArray(req.body?.records)) return res.status(400).json({ message: "Records must be an array" });
    const updatedAt = SharedDataModel.save(req.user.business_id, collection, req.body.records);
    res.json({ success: true, data: req.body.records, updatedAt });
  },
};
