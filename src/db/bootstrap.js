import { ensureCommerceSchemaV2 } from "./schema-v2.js";

let initialized = false;

export const initializeDatabase = () => {
  if (initialized) return;
  ensureCommerceSchemaV2();
  initialized = true;
};
