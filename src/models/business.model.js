import { db } from "../db/connection.js";
import { now } from "../utils.js";

export const BusinessModel = {
  findById(id) { return db.prepare("SELECT * FROM businesses WHERE id = ?").get(id); },
  findForUser(user) { if (!user?.business_id) return null; return this.findById(user.business_id); },
  updateProfile(businessId, profile) { return db.prepare("UPDATE businesses SET name = ?, person = ?, phone = ?, email = ?, address = ?, urdu_name = ?, tax_number = ?, updated_at = ? WHERE id = ?").run(profile.name, profile.person, profile.phone, profile.email, profile.address, profile.urdu_name, profile.tax_number, now(), businessId); },
  updateReferenceData(businessId, referenceData) { return db.prepare("UPDATE businesses SET reference_data = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(referenceData), now(), businessId); },
  updateRuleData(businessId, ruleData) { return db.prepare("UPDATE businesses SET rule_data = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(ruleData), now(), businessId); },
  invoiceCounter(businessId, year) { return db.prepare(`SELECT COUNT(*) AS invoice_count, MAX(CAST(SUBSTR(invoice_number, 6) AS INTEGER)) AS last_invoice_no FROM invoices WHERE business_id = ? AND invoice_number LIKE ?`).get(businessId, `${year}-%`); },
};
