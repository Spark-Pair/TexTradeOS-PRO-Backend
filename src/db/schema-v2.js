import { db } from "../db.js";

const hasColumn = (table, column) => db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
const addColumn = (table, column, definition) => { if (!hasColumn(table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); };

export function ensureCommerceSchemaV2() {
  addColumn("invoices", "customer_id", "TEXT");
  addColumn("invoices", "customer_kind", "TEXT NOT NULL DEFAULT 'registered'");
  addColumn("invoices", "walk_in_person", "TEXT DEFAULT ''");
  addColumn("invoices", "payment_status", "TEXT NOT NULL DEFAULT 'unpaid'");

  db.exec(`
    CREATE TABLE IF NOT EXISTS returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      created_by INTEGER,
      return_number TEXT NOT NULL,
      return_type TEXT NOT NULL CHECK(return_type IN ('sales','purchase')),
      return_date TEXT NOT NULL,
      party_id TEXT,
      party_name TEXT NOT NULL,
      linked_invoice_id INTEGER,
      linked_purchase_id TEXT,
      stock_action TEXT NOT NULL DEFAULT 'return_stock' CHECK(stock_action IN ('return_stock','keep_goods')),
      adjustment_type TEXT NOT NULL DEFAULT 'none',
      adjustment_value REAL NOT NULL DEFAULT 0,
      gross_amount REAL NOT NULL DEFAULT 0,
      adjustment_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      total_pcs REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(business_id, return_type, return_number),
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (linked_invoice_id) REFERENCES invoices(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      article_no TEXT NOT NULL,
      purchase_number TEXT DEFAULT '',
      qr_id TEXT DEFAULT '',
      source_document_id TEXT DEFAULT '',
      description TEXT DEFAULT '',
      pcs REAL NOT NULL,
      rate REAL NOT NULL DEFAULT 0,
      gross_amount REAL NOT NULL DEFAULT 0,
      amount REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (return_id) REFERENCES returns(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS invoice_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      invoice_id INTEGER NOT NULL,
      created_by INTEGER,
      payment_date TEXT NOT NULL,
      method TEXT NOT NULL CHECK(method IN ('cash','cheque','slip','online')),
      amount REAL NOT NULL,
      reference_no TEXT DEFAULT '',
      account_name TEXT DEFAULT '',
      bank_name TEXT DEFAULT '',
      cheque_no TEXT DEFAULT '',
      cheque_date TEXT DEFAULT '',
      slip_no TEXT DEFAULT '',
      transaction_id TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      movement_type TEXT NOT NULL,
      article_no TEXT NOT NULL,
      purchase_number TEXT DEFAULT '',
      pcs REAL NOT NULL,
      reference_type TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_returns_business_type_date ON returns(business_id, return_type, return_date DESC);
    CREATE INDEX IF NOT EXISTS idx_return_items_return ON return_items(return_id, position);
    CREATE INDEX IF NOT EXISTS idx_return_items_article ON return_items(article_no, purchase_number);
    CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id, payment_date);
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_article ON inventory_movements(business_id, article_no, purchase_number);
  `);
}
