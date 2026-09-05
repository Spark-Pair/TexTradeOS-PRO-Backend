import { defaultReferenceData, defaultRuleData, parseJson } from "../db.js";
import { normalizeStringList } from "../utils.js";
import { BusinessModel } from "../models/business.model.js";

const normalizeReferenceData = (value = {}) => ({
  ...defaultReferenceData(),
  ...value,
  user_roles: normalizeStringList(value.user_roles).length ? normalizeStringList(value.user_roles) : ["admin", "staff"],
});

const normalizeRuleData = (value = {}) => ({
  ...defaultRuleData(),
  ...value,
  access_rules: Array.isArray(value.access_rules) ? value.access_rules : defaultRuleData().access_rules,
});

export const BusinessService = {
  referenceData(user) {
    const business = BusinessModel.findForUser(user);
    return { reference_data: normalizeReferenceData(parseJson(business?.reference_data, defaultReferenceData())) };
  },

  updateReferenceData(businessId, value) {
    const referenceData = normalizeReferenceData(value || {});
    BusinessModel.updateReferenceData(businessId, referenceData);
    return { reference_data: referenceData };
  },

  ruleData(user) {
    const business = BusinessModel.findForUser(user);
    return {
      rule_data: normalizeRuleData(parseJson(business?.rule_data, defaultRuleData())),
      reference_data: normalizeReferenceData(parseJson(business?.reference_data, defaultReferenceData())),
    };
  },

  updateRuleData(user, value) {
    const ruleData = normalizeRuleData(value || {});
    const business = BusinessModel.findForUser(user);
    const referenceData = normalizeReferenceData(parseJson(business?.reference_data, defaultReferenceData()));
    BusinessModel.updateRuleData(user.business_id, ruleData);
    return { rule_data: ruleData, reference_data: referenceData };
  },

  invoiceCounter(user, yearInput) {
    const business = BusinessModel.findForUser(user);
    const year = Number(yearInput || new Date().getFullYear());
    const stats = BusinessModel.invoiceCounter(business.id, year);
    const last = Number(stats?.last_invoice_no || 0);
    const invoiceCount = Number(stats?.invoice_count || 0);
    return {
      year,
      last_invoice_no: last,
      next_invoice_no: last + 1,
      can_update: invoiceCount === 0,
      has_invoices: invoiceCount > 0,
      invoice_count: invoiceCount,
    };
  },
};
