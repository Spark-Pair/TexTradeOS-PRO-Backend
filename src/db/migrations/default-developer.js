import bcrypt from "bcryptjs";
import { db } from "../connection.js";
import { now } from "../../utils.js";

const LEGACY_USERNAME = "developer";
const LEGACY_PASSWORD = "developer123";
const DEFAULT_USERNAME = "dev";
const DEFAULT_PASSWORD = "dev@SparkPair";

export const ensureDefaultDeveloperAccount = () => {
  const developer = db.prepare("SELECT id, username, password_hash FROM users WHERE role = 'developer' ORDER BY id LIMIT 1").get();

  if (developer) {
    const isUntouchedLegacyAccount = developer.username === LEGACY_USERNAME
      && bcrypt.compareSync(LEGACY_PASSWORD, developer.password_hash);
    const usernameTaken = db.prepare("SELECT id FROM users WHERE username = ? AND id <> ?").get(DEFAULT_USERNAME, developer.id);
    if (isUntouchedLegacyAccount && !usernameTaken) {
      db.prepare("UPDATE users SET username = ?, password_hash = ?, updated_at = ? WHERE id = ?")
        .run(DEFAULT_USERNAME, bcrypt.hashSync(DEFAULT_PASSWORD, 10), now(), developer.id);
    }
    return;
  }

  const business = db.prepare("SELECT id FROM businesses ORDER BY id LIMIT 1").get();
  const usernameTaken = db.prepare("SELECT id FROM users WHERE username = ?").get(DEFAULT_USERNAME);
  if (!business || usernameTaken) return;

  const timestamp = now();
  db.prepare("INSERT INTO users (business_id, name, username, password_hash, role, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 'developer', 1, ?, ?)")
    .run(business.id, "Developer", DEFAULT_USERNAME, bcrypt.hashSync(DEFAULT_PASSWORD, 10), timestamp, timestamp);
};

