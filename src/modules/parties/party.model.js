import { db } from "../../db/connection.js";

const config = {
  customers: { table: "customers", name: "customer_name" },
  suppliers: { table: "suppliers", name: "supplier_name" },
};

const partyConfig = (kind) => {
  const value = config[kind];
  if (!value) throw new Error("Unsupported party type");
  return value;
};

export const listParties = (kind, businessId) => {
  const { table } = partyConfig(kind);
  return db.prepare(`SELECT * FROM ${table} WHERE business_id = ? ORDER BY created_at DESC`).all(businessId);
};

export const getParty = (kind, businessId, id) => {
  const { table } = partyConfig(kind);
  return db.prepare(`SELECT * FROM ${table} WHERE business_id = ? AND id = ?`).get(businessId, id);
};

export const upsertParty = (kind, businessId, party) => {
  const { table, name } = partyConfig(kind);
  db.prepare(`
    INSERT INTO ${table} (id, business_id, ${name}, person_name, urdu_title, phone_number, address, city, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      ${name} = excluded.${name}, person_name = excluded.person_name, urdu_title = excluded.urdu_title,
      phone_number = excluded.phone_number, address = excluded.address, city = excluded.city,
      is_active = excluded.is_active, updated_at = excluded.updated_at
  `).run(party.id, businessId, party.name, party.person_name, party.urdu_title, party.phone_number, party.address, party.city, party.is_active ? 1 : 0, party.created_at, party.updated_at);
  return getParty(kind, businessId, party.id);
};

export const setPartyStatus = (kind, businessId, id, isActive, updatedAt) => {
  const { table } = partyConfig(kind);
  db.prepare(`UPDATE ${table} SET is_active = ?, updated_at = ? WHERE business_id = ? AND id = ?`).run(isActive ? 1 : 0, updatedAt, businessId, id);
  return getParty(kind, businessId, id);
};
