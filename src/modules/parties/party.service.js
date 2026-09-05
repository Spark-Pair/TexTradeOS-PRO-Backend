import crypto from "node:crypto";
import { getParty, listParties, setPartyStatus, upsertParty } from "./party.model.js";

const text = (value) => String(value || "").trim();
const toDto = (kind, row) => row ? ({
  _id: row.id,
  [`${kind === "customers" ? "customer" : "supplier"}_name`]: row[kind === "customers" ? "customer_name" : "supplier_name"],
  person_name: row.person_name || "",
  urdu_title: row.urdu_title || "",
  phone_number: row.phone_number || "",
  address: row.address || "",
  city: row.city || "",
  isActive: Boolean(row.is_active),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
}) : null;

export const listPartyDtos = (kind, businessId) => listParties(kind, businessId).map((row) => toDto(kind, row));

export const saveParty = (kind, businessId, payload = {}) => {
  const nameKey = kind === "customers" ? "customer_name" : "supplier_name";
  const name = text(payload[nameKey]);
  if (!name) throw Object.assign(new Error(`${kind === "customers" ? "Customer" : "Supplier"} name is required`), { statusCode: 400 });
  const existing = payload._id ? getParty(kind, businessId, payload._id) : null;
  const timestamp = new Date().toISOString();
  return toDto(kind, upsertParty(kind, businessId, {
    id: existing?.id || text(payload._id) || crypto.randomUUID(),
    name,
    person_name: text(payload.person_name), urdu_title: text(payload.urdu_title), phone_number: text(payload.phone_number),
    address: text(payload.address), city: text(payload.city), is_active: payload.isActive ?? existing?.is_active ?? true,
    created_at: existing?.created_at || timestamp, updated_at: timestamp,
  }));
};

export const toggleParty = (kind, businessId, id) => {
  const existing = getParty(kind, businessId, id);
  if (!existing) throw Object.assign(new Error(`${kind === "customers" ? "Customer" : "Supplier"} not found`), { statusCode: 404 });
  return toDto(kind, setPartyStatus(kind, businessId, id, !existing.is_active, new Date().toISOString()));
};
