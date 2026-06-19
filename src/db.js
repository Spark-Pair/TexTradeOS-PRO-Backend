import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
const dbPath = path.resolve(
  process.env.DATABASE_PATH || path.resolve(process.cwd(), "textradeos.sqlite")
);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const isFreshDatabase = !fs.existsSync(dbPath) || fs.statSync(dbPath).size === 0;

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 10000");
db.pragma("synchronous = NORMAL");

const now = () => new Date().toISOString();
const json = (value) => JSON.stringify(value ?? {});

export const defaultReferenceData = () => ({
  user_roles: ["admin", "staff"],
});

export const defaultAccessRules = () => [
  { key: "dashboard", label: "Dashboard", roles: ["admin", "staff"], show_in_sidebar: true },
  { key: "users_manage", label: "Users", roles: ["admin"], show_in_sidebar: true },
  { key: "invoices", label: "Invoices", roles: ["admin", "staff"], show_in_sidebar: true },
  { key: "settings", label: "Settings", roles: ["admin", "staff"], show_in_sidebar: false },
  { key: "keyboard_shortcuts", label: "Keyboard Shortcuts", roles: ["admin", "staff"], show_in_sidebar: false },
];

export const defaultRuleData = () => ({
  access_rules: defaultAccessRules(),
});

const createTables = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS businesses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      person TEXT DEFAULT '',
      price REAL DEFAULT 0,
      registration_date TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      reference_data TEXT NOT NULL,
      rule_data TEXT NOT NULL,
      invoice_banner_data TEXT DEFAULT '',
      machine_options TEXT NOT NULL DEFAULT '[]',
      invoice_counter_year INTEGER NOT NULL DEFAULT 2026,
      invoice_counter_last INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      shortcuts TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      refresh_token TEXT NOT NULL,
      user_agent TEXT DEFAULT '',
      ip TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      revoked_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      created_by INTEGER,
      invoice_number TEXT NOT NULL,
      invoice_date TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_urdu_title TEXT DEFAULT '',
      customer_phone TEXT DEFAULT '',
      customer_address TEXT DEFAULT '',
      gross_amount REAL NOT NULL DEFAULT 0,
      percent_discount_amount REAL NOT NULL DEFAULT 0,
      rupee_discount_amount REAL NOT NULL DEFAULT 0,
      total_discount_amount REAL NOT NULL DEFAULT 0,
      net_amount REAL NOT NULL DEFAULT 0,
      sales_return_amount REAL NOT NULL DEFAULT 0,
      received_amount REAL NOT NULL DEFAULT 0,
      balance_amount REAL NOT NULL DEFAULT 0,
      return_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (business_id, invoice_number),
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      size TEXT DEFAULT '',
      description TEXT DEFAULT '',
      dzn REAL NOT NULL DEFAULT 0,
      pcs REAL NOT NULL DEFAULT 0,
      rate REAL NOT NULL DEFAULT 0,
      gross_amount REAL NOT NULL DEFAULT 0,
      discount TEXT DEFAULT '',
      discount_type TEXT DEFAULT '',
      discount_amount REAL NOT NULL DEFAULT 0,
      amount REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_users_business ON users(business_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_business_date ON invoices(business_id, invoice_date DESC);
    CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id, position);
  `);

  const userColumns = db.prepare("PRAGMA table_info(users)").all();
  if (!userColumns.some((column) => column.name === "shortcuts")) {
    db.exec("ALTER TABLE users ADD COLUMN shortcuts TEXT NOT NULL DEFAULT '{}'");
  }
  const invoiceColumns = db.prepare("PRAGMA table_info(invoices)").all();
  const addInvoiceColumn = (name, definition) => {
    if (!invoiceColumns.some((column) => column.name === name)) {
      db.exec(`ALTER TABLE invoices ADD COLUMN ${name} ${definition}`);
    }
  };
  addInvoiceColumn("customer_urdu_title", "TEXT DEFAULT ''");
  addInvoiceColumn("gross_amount", "REAL NOT NULL DEFAULT 0");
  addInvoiceColumn("percent_discount_amount", "REAL NOT NULL DEFAULT 0");
  addInvoiceColumn("rupee_discount_amount", "REAL NOT NULL DEFAULT 0");
  addInvoiceColumn("total_discount_amount", "REAL NOT NULL DEFAULT 0");
  addInvoiceColumn("net_amount", "REAL NOT NULL DEFAULT 0");
  addInvoiceColumn("sales_return_amount", "REAL NOT NULL DEFAULT 0");
  addInvoiceColumn("received_amount", "REAL NOT NULL DEFAULT 0");
  addInvoiceColumn("balance_amount", "REAL NOT NULL DEFAULT 0");
  addInvoiceColumn("return_amount", "REAL NOT NULL DEFAULT 0");

  const itemColumns = db.prepare("PRAGMA table_info(invoice_items)").all();
  const addItemColumn = (name, definition) => {
    if (!itemColumns.some((column) => column.name === name)) {
      db.exec(`ALTER TABLE invoice_items ADD COLUMN ${name} ${definition}`);
    }
  };
  addItemColumn("gross_amount", "REAL NOT NULL DEFAULT 0");
  addItemColumn("discount_type", "TEXT DEFAULT ''");
};

const seed = () => {
  db.transaction(() => {
    const createdAt = now();
    const business = db.prepare(`
      INSERT INTO businesses (
        name, person, price, registration_date, is_active, reference_data, rule_data,
        invoice_banner_data, machine_options, invoice_counter_year, invoice_counter_last,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "TexTradeOS PRO",
      "",
      0,
      createdAt,
      1,
      json(defaultReferenceData()),
      json(defaultRuleData()),
      "",
      "[]",
      new Date().getFullYear(),
      0,
      createdAt,
      createdAt
    );
    const businessId = Number(business.lastInsertRowid);
    const insertUser = db.prepare(`
      INSERT INTO users (business_id, name, username, password_hash, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `);

    [
      { name: "Developer", username: "developer", password: "developer123", role: "developer", businessId },
      { name: "Admin", username: "admin", password: "admin123", role: "admin", businessId },
    ].forEach((user) => {
      insertUser.run(
        user.businessId,
        user.name,
        user.username,
        bcrypt.hashSync(user.password, 10),
        user.role,
        createdAt,
        createdAt
      );
    });
  }).immediate();
};

createTables();
if (isFreshDatabase) seed();

export const parseJson = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

export const toUserDto = (row) => {
  if (!row) return null;
  return {
    _id: String(row.id),
    id: String(row.id),
    businessId: row.business_id ? String(row.business_id) : null,
    business: row.business_id ? { id: String(row.business_id), name: row.business_name || "" } : null,
    business_name: row.business_name || "",
    name: row.name,
    username: row.username,
    role: row.role,
    isActive: Boolean(row.is_active),
    createdInvoiceCount: Number(row.created_invoice_count || 0),
    shortcuts: parseJson(row.shortcuts, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export const toInvoiceDto = (row, articles = []) => {
  if (!row) return null;
  const lineGross = articles.reduce((sum, article) => sum + Number(article.gross_amount || 0), 0);
  const lineDiscount = articles.reduce((sum, article) => sum + Number(article.discount_amount || 0), 0);
  const grossAmount = Number(row.gross_amount || lineGross || row.total_amount || 0);
  const totalDiscountAmount = Number(row.total_discount_amount || lineDiscount || 0);
  const netAmount = Number(row.net_amount || Math.max(0, grossAmount - totalDiscountAmount));
  const salesReturnAmount = Number(row.sales_return_amount || 0);
  const totalAmount = Number(row.total_amount || Math.max(0, netAmount - salesReturnAmount));
  const receivedAmount = Number(row.received_amount || 0);
  return {
    _id: String(row.id),
    id: String(row.id),
    business_id: String(row.business_id),
    invoice_number: row.invoice_number,
    invoice_date: row.invoice_date,
    customer_name: row.customer_name,
    customer_urdu_title: row.customer_urdu_title || "",
    customer_phone: row.customer_phone || "",
    customer_address: row.customer_address || "",
    order_count: articles.length || Number(row.order_count || 0),
    articles,
    gross_amount: grossAmount,
    percent_discount_amount: Number(row.percent_discount_amount || 0),
    rupee_discount_amount: Number(row.rupee_discount_amount || 0),
    total_discount_amount: totalDiscountAmount,
    net_amount: netAmount,
    sales_return_amount: salesReturnAmount,
    received_amount: receivedAmount,
    balance_amount: Number(row.balance_amount || Math.max(0, totalAmount - receivedAmount)),
    return_amount: Number(row.return_amount || Math.max(0, receivedAmount - totalAmount)),
    total_amount: totalAmount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};
