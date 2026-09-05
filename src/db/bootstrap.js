import { isFreshDatabase } from "./connection.js";
import { ensureCoreSchema } from "./core-schema.js";
import { ensureCommerceSchemaV2 } from "./schema-v2.js";
import { seedFreshDatabase } from "./seed.js";
import { backfillBusinessAccessRules } from "./migrations/access-rules.js";

let initialized = false;

export const initializeDatabase = () => {
  if (initialized) return;
  ensureCoreSchema();
  if (isFreshDatabase) seedFreshDatabase();
  ensureCommerceSchemaV2();
  backfillBusinessAccessRules();
  initialized = true;
};
