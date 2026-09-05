import { db, parseJson } from "../db.js";
import { now } from "../utils.js";

export const SharedDataModel = {
  all(businessId) {
    const rows = db.prepare("SELECT collection, payload, updated_at FROM shared_collections WHERE business_id = ?").all(businessId);
    return Object.fromEntries(rows.map((row) => [row.collection, parseJson(row.payload, [])]));
  },

  save(businessId, collection, records) {
    const timestamp = now();
    db.prepare(`
      INSERT INTO shared_collections (business_id, collection, payload, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(business_id, collection) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
    `).run(businessId, collection, JSON.stringify(records), timestamp);
    return timestamp;
  },
};
