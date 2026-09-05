import bcrypt from "bcryptjs";
import { db } from "./connection.js";
import { defaultReferenceData, defaultRuleData } from "../config/business-defaults.js";

const now = () => new Date().toISOString();

export const seedFreshDatabase = () => {
  db.transaction(() => {
    const createdAt = now();
    const business = db.prepare(`
      INSERT INTO businesses (
        name, person, price, registration_date, is_active, reference_data, rule_data,
        invoice_banner_data, machine_options, invoice_counter_year, invoice_counter_last, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "TexTradeOS PRO", "", 0, createdAt, 1,
      JSON.stringify(defaultReferenceData()), JSON.stringify(defaultRuleData()),
      "", "[]", new Date().getFullYear(), 0, createdAt, createdAt
    );
    const businessId = Number(business.lastInsertRowid);
    const insertUser = db.prepare(`
      INSERT INTO users (business_id, name, username, password_hash, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `);
    [
      { name: "Developer", username: "developer", password: "developer123", role: "developer" },
      { name: "Admin", username: "admin", password: "admin123", role: "admin" },
    ].forEach((user) => insertUser.run(
      businessId, user.name, user.username, bcrypt.hashSync(user.password, 10), user.role, createdAt, createdAt
    ));
  }).immediate();
};
