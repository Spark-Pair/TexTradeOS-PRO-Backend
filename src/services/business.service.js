import { parseJson } from "../db.js";
import { normalizeStringList } from "../utils.js";
import { BusinessModel } from "../models/business.model.js";

const fail = (status, message) => Object.assign(new Error(message), { status });

const requireBusiness = (user) => {
  const business = BusinessModel.findForUser(user);
  if (!business) throw fail(404, "Business not found");
  return business;
};

const parseStoredObject = (value, fieldName) => {
  const parsed = parseJson(value, null);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw fail(500, `Stored ${fieldName} is invalid`);
  }
  return parsed;
};

const normalizeReferenceDataForWrite = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw fail(400, "reference_data must be an object");
  }
  const roles = normalizeStringList(value.user_roles).filter((role) => role !== "developer");
  if (!roles.length) throw fail(400, "At least one business user role is required");
  return { ...value, user_roles: roles };
};

const normalizeRuleDataForWrite = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw fail(400, "rule_data must be an object");
  }
  if (!Array.isArray(value.access_rules)) throw fail(400, "rule_data.access_rules must be an array");

  const accessRules = value.access_rules.map((rule) => {
    const key = String(rule?.key || "").trim();
    if (!key) throw fail(400, "Every access rule requires a key");
    return {
      ...rule,
      key,
      roles: normalizeStringList(rule.roles).filter((role) => role !== "developer"),
      show_in_sidebar: Boolean(rule.show_in_sidebar),
    };
  });

  return { ...value, access_rules: accessRules };
};

export const BusinessService = {
  referenceData(user) {
    const business = requireBusiness(user);
    return { reference_data: parseStoredObject(business.reference_data, "reference_data") };
  },

  updateReferenceData(user, value) {
    const business = requireBusiness(user);
    const referenceData = normalizeReferenceDataForWrite(value);
    BusinessModel.updateReferenceData(business.id, referenceData);
    return { reference_data: referenceData };
  },

  ruleData(user) {
    const business = requireBusiness(user);
    return {
      rule_data: parseStoredObject(business.rule_data, "rule_data"),
      reference_data: parseStoredObject(business.reference_data, "reference_data"),
    };
  },

  updateRuleData(user, value) {
    const business = requireBusiness(user);
    const ruleData = normalizeRuleDataForWrite(value);
    BusinessModel.updateRuleData(business.id, ruleData);
    return {
      rule_data: ruleData,
      reference_data: parseStoredObject(business.reference_data, "reference_data"),
    };
  },

  invoiceCounter(user, yearInput) {
    const business = requireBusiness(user);
    const year = Number(yearInput || new Date().getFullYear());
    if (!Number.isInteger(year) || year < 2000 || year > 9999) throw fail(400, "Invalid invoice year");
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
