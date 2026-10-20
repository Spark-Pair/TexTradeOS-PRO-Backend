import { ensureCoreSchema } from "./core-schema.js";
import { ensureCommerceSchemaV2 } from "./schema-v2.js";
import { backfillBusinessAccessRules } from "./migrations/access-rules.js";
import { ensureDefaultDeveloperAccount } from "./migrations/default-developer.js";
import { seedDefaultUsers } from "./seed.js";

let initialized = false;

export const initializeDatabase = () => {
  if (initialized) return;
  ensureCoreSchema();
  seedDefaultUsers();
  ensureDefaultDeveloperAccount();
  ensureCommerceSchemaV2();
  backfillBusinessAccessRules();
  initialized = true;
};
