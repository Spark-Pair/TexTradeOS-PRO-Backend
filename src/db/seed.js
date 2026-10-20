import bcrypt from "bcryptjs";
import { db } from "./connection.js";
import { defaultReferenceData, defaultRuleData } from "../config/business-defaults.js";

const now = () => new Date().toISOString();

export const seedDefaultUsers = () => {
  db.transaction(() => {
    const createdAt = now();
    let business = db.prepare("SELECT id FROM businesses ORDER BY id LIMIT 1").get();
    if (!business) {
      const result = db.prepare(`
        INSERT INTO businesses (
          name, person, price, registration_date, is_active, reference_data, rule_data,
          invoice_banner_data, machine_options, invoice_counter_year, invoice_counter_last, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "", "", 0, createdAt, 1,
        JSON.stringify(defaultReferenceData()), JSON.stringify(defaultRuleData()),
        "", "[]", new Date().getFullYear(), 0, createdAt, createdAt
      );
      business = { id: Number(result.lastInsertRowid) };
    }
    const businessId = Number(business.id);
    const insertUser = db.prepare(`
      INSERT INTO users (business_id, name, username, password_hash, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `);
    [
      { name: "Developer", username: "dev", password: "dev@SparkPair", role: "developer" },
      { name: "Admin", username: "admin", password: "admin123", role: "admin" },
    ].forEach((user) => {
      const exists = db.prepare("SELECT id FROM users WHERE username = ? LIMIT 1").get(user.username);
      if (!exists) {
        insertUser.run(
          businessId, user.name, user.username, bcrypt.hashSync(user.password, 10), user.role, createdAt, createdAt
        );
      }
    });
  }).immediate();
};
