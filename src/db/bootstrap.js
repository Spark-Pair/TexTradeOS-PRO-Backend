import { ensureCoreSchema } from "./core-schema.js";
import { ensureCommerceSchemaV2 } from "./schema-v2.js";
import { backfillBusinessAccessRules } from "./migrations/access-rules.js";
import { ensureDefaultDeveloperAccount } from "./migrations/default-developer.js";
import { seedDefaultUsers } from "./seed.js";

let initialized = false;

export const initializeDatabase = () => {
  if (initialized) return;
  ensureCoreSchema();
  ensureCommerceSchemaV2();
  // Runs on every backend start, including the successful start after an update.
  // It only ensures the default users/business exist; it does not insert demo data.
  seedDefaultUsers();
  ensureDefaultDeveloperAccount();
  backfillBusinessAccessRules();
  initialized = true;
};
