import { BusinessService } from "../services/business.service.js";

const send = (res, action) => {
  try {
    return res.json(action());
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "Business operation failed" });
  }
};

export const BusinessController = {
  referenceData: (req, res) => send(res, () => BusinessService.referenceData(req.user)),
  updateReferenceData: (req, res) => send(res, () => BusinessService.updateReferenceData(req.user, req.body?.reference_data)),
  ruleData: (req, res) => send(res, () => BusinessService.ruleData(req.user)),
  updateRuleData: (req, res) => send(res, () => BusinessService.updateRuleData(req.user, req.body?.rule_data)),
  invoiceCounter: (req, res) => send(res, () => BusinessService.invoiceCounter(req.user, req.query.year)),
};
