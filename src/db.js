import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
const dbPath = path.resolve(
  process.env.DATABASE_PATH || path.resolve(process.cwd(), "textradeos.sqlite")
);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

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
      customer_phone TEXT DEFAULT '',
      customer_address TEXT DEFAULT '',
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
      discount TEXT DEFAULT '',
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
};

const seed = () => {
  const businessCount = db.prepare("SELECT COUNT(*) AS count FROM businesses").get().count;
  let businessId = 1;

  if (!businessCount) {
    const createdAt = now();
    const res = db.prepare(`
      INSERT INTO businesses (
        name, person, price, registration_date, is_active, reference_data, rule_data,
        invoice_banner_data, machine_options, invoice_counter_year, invoice_counter_last,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "TexTrade Demo",
      "Owner",
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
    businessId = Number(res.lastInsertRowid);
  } else {
    businessId = db.prepare("SELECT id FROM businesses ORDER BY id LIMIT 1").get().id;
  }

  const userCount = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (!userCount) {
    const insertUser = db.prepare(`
      INSERT INTO users (business_id, name, username, password_hash, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `);

    const createdAt = now();
    [
      { name: "Developer", username: "developer", password: "developer123", role: "developer", businessId },
      { name: "Admin", username: "admin", password: "admin123", role: "admin", businessId },
      { name: "Staff", username: "staff", password: "staff123", role: "staff", businessId },
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
  }

  const admin = db.prepare("SELECT id FROM users WHERE business_id = ? AND role = 'admin' ORDER BY id LIMIT 1").get(businessId);
  const samples = [
    {
      number: "2026-0001",
      date: "2026-04-12",
      customer: "Al Noor Garments",
      phone: "0300-1112233",
      address: "Korangi, Karachi",
      items: [
        { size: "M", description: "Cotton Shirt", pcs: 24, rate: 420, discount: "5%" },
      ],
    },
    {
      number: "2026-0002",
      date: "2026-05-06",
      customer: "City Fashion",
      phone: "0312-4445566",
      address: "Saddar, Karachi",
      items: [
        { size: "L", description: "Printed T Shirt", pcs: 36, rate: 350, discount: "" },
      ],
    },
    {
      number: "2026-0003",
      date: "2026-05-21",
      customer: "New Style Traders",
      phone: "0333-7654321",
      address: "Lahore",
      items: [
        { size: "XL", description: "Track Suit", pcs: 18, rate: 950, discount: "500" },
      ],
    },
    {
      number: "2026-0004",
      date: "2026-06-01",
      customer: "Awan Collection",
      phone: "0301-2223344",
      address: "Faisalabad",
      items: [
        { size: "M", description: "Polo Shirt", pcs: 48, rate: 480, discount: "4%" },
        { size: "L", description: "Polo Shirt", pcs: 24, rate: 500, discount: "" },
      ],
    },
    {
      number: "2026-0005",
      date: "2026-06-04",
      customer: "Modern Wear",
      phone: "0321-9998877",
      address: "Hyderabad",
      items: [
        { size: "S", description: "Kids Trouser", pcs: 60, rate: 275, discount: "3%" },
      ],
    },
    {
      number: "2026-0006",
      date: "2026-06-07",
      customer: "Prime Textile",
      phone: "0345-1239876",
      address: "SITE Area, Karachi",
      items: [
        { size: "L", description: "Work Uniform", pcs: 30, rate: 780, discount: "" },
      ],
    },
  ];

  const insertInvoice = db.prepare(`
    INSERT INTO invoices (
      business_id, created_by, invoice_number, invoice_date, customer_name,
      customer_phone, customer_address, total_amount, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO invoice_items (
      invoice_id, position, size, description, dzn, pcs, rate,
      discount, discount_amount, amount
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    let nextInvoiceNo = Number(
      db.prepare(`
        SELECT MAX(CAST(SUBSTR(invoice_number, 6) AS INTEGER)) AS last_no
        FROM invoices
        WHERE business_id = ? AND invoice_number LIKE '2026-%'
      `).get(businessId)?.last_no || 0
    );

    samples.forEach((sample) => {
      const exists = db.prepare(`
        SELECT id FROM invoices
        WHERE business_id = ? AND invoice_date = ? AND customer_name = ?
        LIMIT 1
      `).get(businessId, sample.date, sample.customer);
      if (exists) return;

      nextInvoiceNo += 1;
      const invoiceNumber = `2026-${String(nextInvoiceNo).padStart(4, "0")}`;
      const normalizedItems = sample.items.map((item) => {
        const gross = item.pcs * item.rate;
        const rawDiscount = String(item.discount || "");
        const discountAmount = rawDiscount.endsWith("%")
          ? gross * Number(rawDiscount.slice(0, -1) || 0) / 100
          : Number(rawDiscount || 0);
        return {
          ...item,
          dzn: item.pcs / 12,
          discountAmount,
          amount: gross - discountAmount,
        };
      });
      const total = normalizedItems.reduce((sum, item) => sum + item.amount, 0);
      const timestamp = `${sample.date}T10:00:00.000Z`;
      const result = insertInvoice.run(
        businessId,
        admin?.id || null,
        invoiceNumber,
        sample.date,
        sample.customer,
        sample.phone,
        sample.address,
        total,
        timestamp,
        timestamp
      );
      normalizedItems.forEach((item, index) => {
        insertItem.run(
          result.lastInsertRowid,
          index + 1,
          item.size,
          item.description,
          item.dzn,
          item.pcs,
          item.rate,
          item.discount,
          item.discountAmount,
          item.amount
        );
      });
    });
    db.prepare("UPDATE businesses SET invoice_counter_year = 2026, invoice_counter_last = ? WHERE id = ?")
      .run(nextInvoiceNo, businessId);
  })();
};

createTables();
seed();

export const parseJson = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

export const toBusinessDto = (row) => {
  if (!row) return null;
  return {
    _id: String(row.id),
    id: String(row.id),
    name: row.name,
    person: row.person,
    price: Number(row.price || 0),
    registration_date: row.registration_date,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
    shortcuts: parseJson(row.shortcuts, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export const toInvoiceDto = (row, articles = []) => {
  if (!row) return null;
  return {
    _id: String(row.id),
    id: String(row.id),
    business_id: String(row.business_id),
    invoice_number: row.invoice_number,
    invoice_date: row.invoice_date,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone || "",
    customer_address: row.customer_address || "",
    order_count: articles.length || Number(row.order_count || 0),
    articles,
    total_amount: Number(row.total_amount || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};
