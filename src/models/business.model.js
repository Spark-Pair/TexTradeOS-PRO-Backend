import { db } from "../db.js";
import { now } from "../utils.js";

export const BusinessModel = {
  findForUser(user) {
    const businessId = user?.business_id || db.prepare("SELECT id FROM businesses ORDER BY id LIMIT 1").get()?.id;
    return db.prepare("SELECT * FROM businesses WHERE id = ?").get(businessId);
  },

  updateReferenceData(businessId, referenceData) {
    db.prepare("UPDATE businesses SET reference_data = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(referenceData), now(), businessId);
  },

  updateRuleData(businessId, ruleData) {
    db.prepare("UPDATE businesses SET rule_data = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(ruleData), now(), businessId);
  },

  invoiceCounter(businessId, year) {
    return db.prepare(`
      SELECT COUNT(*) AS invoice_count,
        MAX(CAST(SUBSTR(invoice_number, 6) AS INTEGER)) AS last_invoice_no
      FROM invoices
      WHERE business_id = ? AND invoice_number LIKE ?
    `).get(businessId, `${year}-%`);
  },
};
