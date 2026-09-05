import { BusinessService } from "../services/business.service.js";

export const BusinessController = {
  referenceData(req, res) {
    res.json(BusinessService.referenceData(req.user));
  },
  updateReferenceData(req, res) {
    res.json(BusinessService.updateReferenceData(req.user.business_id, req.body?.reference_data));
  },
  ruleData(req, res) {
    res.json(BusinessService.ruleData(req.user));
  },
  updateRuleData(req, res) {
    res.json(BusinessService.updateRuleData(req.user, req.body?.rule_data));
  },
  invoiceCounter(req, res) {
    res.json(BusinessService.invoiceCounter(req.user, req.query.year));
  },
};
