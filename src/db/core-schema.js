import { db } from "./connection.js";

export const ensureCoreSchema = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS businesses (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, person TEXT DEFAULT '', price REAL DEFAULT 0,
      registration_date TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1, reference_data TEXT NOT NULL,
      rule_data TEXT NOT NULL, invoice_banner_data TEXT DEFAULT '', machine_options TEXT NOT NULL DEFAULT '[]',
      invoice_counter_year INTEGER NOT NULL DEFAULT 2026, invoice_counter_last INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, business_id INTEGER, name TEXT NOT NULL, username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, role TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1,
      shortcuts TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, refresh_token TEXT NOT NULL, user_agent TEXT DEFAULT '', ip TEXT DEFAULT '',
      created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, revoked_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT, business_id INTEGER NOT NULL, created_by INTEGER, invoice_number TEXT NOT NULL,
      invoice_date TEXT NOT NULL, customer_name TEXT NOT NULL, customer_urdu_title TEXT DEFAULT '', salesman_name TEXT DEFAULT '',
      customer_phone TEXT DEFAULT '', customer_address TEXT DEFAULT '', gross_amount REAL NOT NULL DEFAULT 0,
      percent_discount_amount REAL NOT NULL DEFAULT 0, rupee_discount_amount REAL NOT NULL DEFAULT 0,
      total_discount_amount REAL NOT NULL DEFAULT 0, net_amount REAL NOT NULL DEFAULT 0, sales_return_amount REAL NOT NULL DEFAULT 0,
      received_amount REAL NOT NULL DEFAULT 0, balance_amount REAL NOT NULL DEFAULT 0, return_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE (business_id, invoice_number), FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL, position INTEGER NOT NULL, size TEXT DEFAULT '',
      description TEXT DEFAULT '', dzn REAL NOT NULL DEFAULT 0, pcs REAL NOT NULL DEFAULT 0, rate REAL NOT NULL DEFAULT 0,
      gross_amount REAL NOT NULL DEFAULT 0, discount TEXT DEFAULT '', discount_type TEXT DEFAULT '',
      discount_amount REAL NOT NULL DEFAULT 0, amount REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS shared_collections (
      business_id INTEGER NOT NULL, collection TEXT NOT NULL, payload TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL,
      PRIMARY KEY (business_id, collection), FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_users_business ON users(business_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_business_date ON invoices(business_id, invoice_date DESC);
    CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id, position);
  `);

  const ensureColumn = (table, name, definition) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some((column) => column.name === name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };

  ensureColumn("users", "shortcuts", "TEXT NOT NULL DEFAULT '{}'");
  [
    ["customer_urdu_title", "TEXT DEFAULT ''"], ["salesman_name", "TEXT DEFAULT ''"],
    ["gross_amount", "REAL NOT NULL DEFAULT 0"], ["percent_discount_amount", "REAL NOT NULL DEFAULT 0"],
    ["rupee_discount_amount", "REAL NOT NULL DEFAULT 0"], ["total_discount_amount", "REAL NOT NULL DEFAULT 0"],
    ["net_amount", "REAL NOT NULL DEFAULT 0"], ["sales_return_amount", "REAL NOT NULL DEFAULT 0"],
    ["received_amount", "REAL NOT NULL DEFAULT 0"], ["balance_amount", "REAL NOT NULL DEFAULT 0"],
    ["return_amount", "REAL NOT NULL DEFAULT 0"],
  ].forEach(([name, definition]) => ensureColumn("invoices", name, definition));
  [
    ["gross_amount", "REAL NOT NULL DEFAULT 0"], ["discount_type", "TEXT DEFAULT ''"],
    ["article_no", "TEXT DEFAULT ''"], ["purchase_number", "TEXT DEFAULT ''"],
    ["unit", "REAL NOT NULL DEFAULT 0"], ["quantity_pkt", "REAL NOT NULL DEFAULT 0"],
    ["purchase_rate", "REAL NOT NULL DEFAULT 0"],
  ].forEach(([name, definition]) => ensureColumn("invoice_items", name, definition));
};
