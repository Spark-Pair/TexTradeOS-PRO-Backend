import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, defaultReferenceData, defaultRuleData, parseJson, toBusinessDto, toInvoiceDto, toUserDto } from "./db.js";
import { newSessionId, requireAuth, requireBusinessAdmin, requireDeveloper, signAccessToken, signRefreshToken } from "./auth.js";
import { requireLicense, validateLicense } from "./license.js";
import { checkForUpdate, getPendingMandatoryUpdate, requestUpdate } from "./updates.js";
import { asyncHandler, normalizeStringList, now, paginate } from "./utils.js";

const app = express();
const PORT = Number(process.env.PORT || 4000);
const CORS_ORIGINS = String(process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const APP_VERSION = process.env.APP_VERSION || "0.0.0";

app.use(cors({
  origin(origin, callback) {
    if (!origin || CORS_ORIGINS.includes("*") || CORS_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origin is not allowed"));
  },
  credentials: true,
}));
app.use(express.json({ limit: "2mb" }));

const userSelect = `
  SELECT users.*, businesses.name AS business_name
  FROM users
  LEFT JOIN businesses ON businesses.id = users.business_id
`;

const getBusinessForUser = (user) => {
  const businessId = user?.business_id || db.prepare("SELECT id FROM businesses ORDER BY id LIMIT 1").get()?.id;
  return db.prepare("SELECT * FROM businesses WHERE id = ?").get(businessId);
};

const normalizeReferenceData = (value = {}) => ({
  ...defaultReferenceData(),
  ...value,
  user_roles: normalizeStringList(value.user_roles).length ? normalizeStringList(value.user_roles) : ["admin", "staff"],
});

const normalizeRuleData = (value = {}) => ({
  ...defaultRuleData(),
  ...value,
  access_rules: Array.isArray(value.access_rules) ? value.access_rules : defaultRuleData().access_rules,
});

app.get("/api/health", (req, res) => {
  const license = validateLicense();
  res.json({
    ok: true,
    app: "TexTradeOSBackend",
    version: APP_VERSION,
    license: { allowed: license.allowed, code: license.code },
  });
});

app.get("/api/version", (req, res) => {
  res.json({ version: APP_VERSION });
});

app.get("/api/license/status", (req, res) => {
  const result = validateLicense();
  res.status(result.allowed ? 200 : 403).json(result);
});

app.use("/api", requireLicense);

app.post("/api/auth/login", asyncHandler(async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  if (!username || !password) return res.status(400).json({ message: "Username and password are required" });

  const user = db.prepare(`${userSelect} WHERE users.username = ?`).get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ message: "Invalid username or password" });
  }
  if (!user.is_active) return res.status(403).json({ message: "User is inactive" });

  const sessionId = newSessionId();
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user, sessionId);
  const timestamp = now();

  db.prepare(`
    INSERT INTO sessions (id, user_id, refresh_token, user_agent, ip, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(sessionId, user.id, refreshToken, req.headers["user-agent"] || "", req.ip || "", timestamp, timestamp);

  res.json({
    accessToken,
    refreshToken,
    sessionId,
    user: toUserDto(user),
  });
}));

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: req.userDto });
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
  const sessionId = String(req.body?.sessionId || req.headers["x-session-id"] || "");
  if (sessionId) {
    db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ?").run(now(), sessionId, req.user.id);
  }
  res.json({ success: true });
});

app.post("/api/auth/logout-all", requireAuth, (req, res) => {
  db.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(now(), req.user.id);
  res.json({ success: true });
});

app.get("/api/auth/sessions", requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT id, user_agent, ip, created_at, last_seen_at
    FROM sessions
    WHERE user_id = ? AND revoked_at IS NULL
    ORDER BY last_seen_at DESC
  `).all(req.user.id);
  res.json({
    sessions: rows.map((row) => ({
      sessionId: row.id,
      userAgent: row.user_agent,
      ip: row.ip,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
    })),
  });
});

app.delete("/api/auth/sessions/:id", requireAuth, (req, res) => {
  db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ?")
    .run(now(), req.params.id, req.user.id);
  res.json({ success: true });
});

app.patch("/api/auth/shortcuts", requireAuth, (req, res) => {
  const shortcuts = req.body?.shortcuts && typeof req.body.shortcuts === "object"
    ? req.body.shortcuts
    : {};
  db.prepare("UPDATE users SET shortcuts = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(shortcuts), now(), req.user.id);
  res.json({ shortcuts });
});

app.post("/api/auth/refresh", (req, res) => {
  const refreshToken = String(req.body?.refreshToken || "");
  const sessionId = String(req.body?.sessionId || "");
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || "dev-refresh-secret");
    if (String(payload.sid) !== sessionId) throw new Error("Session mismatch");
    const session = db.prepare("SELECT * FROM sessions WHERE id = ? AND refresh_token = ? AND revoked_at IS NULL").get(sessionId, refreshToken);
    if (!session) throw new Error("Session not found");
    const user = db.prepare(`${userSelect} WHERE users.id = ?`).get(payload.sub);
    if (!user || !user.is_active) throw new Error("User unavailable");
    res.json({ accessToken: signAccessToken(user) });
  } catch {
    res.status(401).json({ message: "Invalid refresh token" });
  }
});

app.get("/api/updates/status", requireAuth, asyncHandler(async (req, res) => {
  res.json(await checkForUpdate());
}));

app.post("/api/updates/install", requireAuth, requireBusinessAdmin, asyncHandler(async (req, res) => {
  res.status(202).json(await requestUpdate());
}));

app.use("/api", (req, res, next) => {
  const update = getPendingMandatoryUpdate();
  if (!update) return next();
  return res.status(503).json({
    code: "MANDATORY_UPDATE_REQUIRED",
    message: `TexTradeOS ${update.version} must be installed before continuing.`,
    update,
  });
});

app.get("/api/users", requireAuth, requireDeveloper, (req, res) => {
  const rows = db.prepare(`${userSelect} ORDER BY users.updated_at DESC`).all().map(toUserDto);
  const filtered = filterUsers(rows, req.query);
  res.json(paginate(filtered, req.query));
});

app.get("/api/users/stats", requireAuth, requireDeveloper, (req, res) => {
  const rows = db.prepare("SELECT is_active FROM users").all();
  res.json(statsResponse(rows));
});

app.get("/api/users/business", requireAuth, (req, res) => {
  const rows = db.prepare(`${userSelect} WHERE users.business_id = ? ORDER BY users.updated_at DESC`).all(req.user.business_id).map(toUserDto);
  const filtered = filterUsers(rows, req.query);
  res.json(paginate(filtered, req.query));
});

app.get("/api/users/business/stats", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT is_active FROM users WHERE business_id = ?").all(req.user.business_id);
  res.json(statsResponse(rows));
});

app.post("/api/users/business", requireAuth, requireBusinessAdmin, (req, res) => {
  const payload = req.body || {};
  const name = String(payload.name || "").trim();
  const username = String(payload.username || "").trim();
  const password = String(payload.password || "").trim();
  const role = String(payload.role || "staff").trim();
  if (!name || !username || !password) return res.status(400).json({ message: "Name, username, and password are required" });
  if (role === "developer") return res.status(400).json({ message: "Cannot create developer users here" });

  const timestamp = now();
  try {
    const result = db.prepare(`
      INSERT INTO users (business_id, name, username, password_hash, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(req.user.business_id, name, username, bcrypt.hashSync(password, 10), role, timestamp, timestamp);
    res.status(201).json({ id: String(result.lastInsertRowid), success: true });
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) return res.status(409).json({ message: "Username already exists" });
    throw error;
  }
});

app.patch("/api/users/business/:id/toggle-status", requireAuth, requireBusinessAdmin, (req, res) => {
  toggleUserStatus(req.params.id, req.user.business_id, res);
});

app.patch("/api/users/:id/toggle-status", requireAuth, requireDeveloper, (req, res) => {
  toggleUserStatus(req.params.id, null, res);
});

app.patch("/api/users/business/:id/reset-password", requireAuth, requireBusinessAdmin, (req, res) => {
  resetPassword(req.params.id, req.body?.newPassword, req.user.business_id, res);
});

app.patch("/api/users/:id/reset-password", requireAuth, requireDeveloper, (req, res) => {
  resetPassword(req.params.id, req.body?.newPassword, null, res);
});

app.get("/api/users/active-sessions", requireAuth, requireDeveloper, (req, res) => {
  const rows = db.prepare(`
    SELECT users.id AS userId, users.name, users.username, COUNT(sessions.id) AS sessionCount, MAX(sessions.last_seen_at) AS lastSeenAt
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.revoked_at IS NULL
    GROUP BY users.id
    ORDER BY lastSeenAt DESC
  `).all();
  res.json({ data: rows.map((row) => ({ ...row, userId: String(row.userId) })) });
});

app.delete("/api/users/:id/active-sessions", requireAuth, requireDeveloper, (req, res) => {
  db.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(now(), req.params.id);
  res.json({ success: true });
});

app.get("/api/businesses", requireAuth, requireDeveloper, (req, res) => {
  const rows = db.prepare("SELECT * FROM businesses ORDER BY updated_at DESC").all().map(toBusinessDto);
  res.json(paginate(rows, req.query));
});

app.get("/api/businesses/stats", requireAuth, requireDeveloper, (req, res) => {
  const rows = db.prepare("SELECT is_active FROM businesses").all();
  res.json(statsResponse(rows));
});

app.get("/api/businesses/me/reference-data", requireAuth, (req, res) => {
  const business = getBusinessForUser(req.user);
  res.json({ reference_data: normalizeReferenceData(parseJson(business?.reference_data, defaultReferenceData())) });
});

app.patch("/api/businesses/me/reference-data", requireAuth, requireBusinessAdmin, (req, res) => {
  const referenceData = normalizeReferenceData(req.body?.reference_data || {});
  db.prepare("UPDATE businesses SET reference_data = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(referenceData), now(), req.user.business_id);
  res.json({ reference_data: referenceData });
});

app.get("/api/businesses/me/rule-data", requireAuth, (req, res) => {
  const business = getBusinessForUser(req.user);
  res.json({
    rule_data: normalizeRuleData(parseJson(business?.rule_data, defaultRuleData())),
    reference_data: normalizeReferenceData(parseJson(business?.reference_data, defaultReferenceData())),
  });
});

app.patch("/api/businesses/me/rule-data", requireAuth, requireBusinessAdmin, (req, res) => {
  const ruleData = normalizeRuleData(req.body?.rule_data || {});
  const business = getBusinessForUser(req.user);
  const referenceData = normalizeReferenceData(parseJson(business?.reference_data, defaultReferenceData()));
  db.prepare("UPDATE businesses SET rule_data = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(ruleData), now(), req.user.business_id);
  res.json({ rule_data: ruleData, reference_data: referenceData });
});

app.get("/api/businesses/me/invoice-banner", requireAuth, (req, res) => {
  const business = getBusinessForUser(req.user);
  res.json({ invoice_banner_data: business?.invoice_banner_data || "" });
});

app.patch("/api/businesses/me/invoice-banner", requireAuth, requireBusinessAdmin, (req, res) => {
  const value = String(req.body?.invoice_banner_data || "");
  db.prepare("UPDATE businesses SET invoice_banner_data = ?, updated_at = ? WHERE id = ?")
    .run(value, now(), req.user.business_id);
  res.json({ invoice_banner_data: value });
});

app.get("/api/businesses/me/machine-options", requireAuth, (req, res) => {
  const business = getBusinessForUser(req.user);
  res.json({ machine_options: normalizeStringList(parseJson(business?.machine_options, [])) });
});

app.patch("/api/businesses/me/machine-options", requireAuth, requireBusinessAdmin, (req, res) => {
  const machineOptions = normalizeStringList(req.body?.machine_options || []);
  db.prepare("UPDATE businesses SET machine_options = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(machineOptions), now(), req.user.business_id);
  res.json({ machine_options: machineOptions });
});

app.get("/api/businesses/me/invoice-counter", requireAuth, (req, res) => {
  const business = getBusinessForUser(req.user);
  const year = Number(req.query.year || new Date().getFullYear());
  const stats = db.prepare(`
    SELECT COUNT(*) AS invoice_count,
      MAX(CAST(SUBSTR(invoice_number, 6) AS INTEGER)) AS last_invoice_no
    FROM invoices
    WHERE business_id = ? AND invoice_number LIKE ?
  `).get(business.id, `${year}-%`);
  const last = Number(stats?.last_invoice_no || 0);
  res.json({
    year,
    last_invoice_no: last,
    next_invoice_no: last + 1,
    can_update: Number(stats?.invoice_count || 0) === 0,
    has_invoices: Number(stats?.invoice_count || 0) > 0,
    invoice_count: Number(stats?.invoice_count || 0),
  });
});

app.patch("/api/businesses/me/invoice-counter", requireAuth, requireBusinessAdmin, (req, res) => {
  const year = Number(req.body?.year || new Date().getFullYear());
  const last = Math.max(0, Number(req.body?.last_invoice_no || 0));
  const count = db.prepare("SELECT COUNT(*) AS count FROM invoices WHERE business_id = ? AND invoice_number LIKE ?")
    .get(req.user.business_id, `${year}-%`).count;
  if (count > 0) return res.status(409).json({ message: "Invoice counter cannot be changed after invoices exist for this year" });
  db.prepare("UPDATE businesses SET invoice_counter_year = ?, invoice_counter_last = ?, updated_at = ? WHERE id = ?")
    .run(year, last, now(), req.user.business_id);
  res.json({ year, last_invoice_no: last, next_invoice_no: last + 1, can_update: true, has_invoices: false, invoice_count: 0 });
});

app.get("/api/dashboard/summary", requireAuth, (req, res) => {
  const businessId = req.user.business_id;
  const invoiceStats = db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS amount
    FROM invoices WHERE business_id = ?
  `).get(businessId);
  const userStats = db.prepare(`
    SELECT COUNT(*) AS count,
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active
    FROM users WHERE business_id = ?
  `).get(businessId);
  const recent = db.prepare(`
    SELECT *, (SELECT COUNT(*) FROM invoice_items WHERE invoice_id = invoices.id) AS order_count
    FROM invoices WHERE business_id = ?
    ORDER BY invoice_date DESC, id DESC LIMIT 5
  `).all(businessId).map((row) => toInvoiceDto(row));
  res.json({
    data: {
      invoices: { count: Number(invoiceStats.count), amount: Number(invoiceStats.amount) },
      users: { count: Number(userStats.count), active: Number(userStats.active || 0) },
      recent: { invoices: recent },
    },
  });
});

app.get("/api/dashboard/trend", requireAuth, (req, res) => {
  const dateFrom = String(req.query.date_from || "").trim();
  const dateTo = String(req.query.date_to || "").trim();
  if (!dateFrom || !dateTo) {
    return res.status(400).json({ message: "date_from and date_to are required" });
  }

  const rows = db.prepare(`
    SELECT invoice_date AS day,
      COUNT(*) AS invoice_count,
      COALESCE(SUM(total_amount), 0) AS invoice_amount
    FROM invoices
    WHERE business_id = ? AND invoice_date BETWEEN ? AND ?
    GROUP BY invoice_date
    ORDER BY invoice_date
  `).all(req.user.business_id, dateFrom, dateTo);

  const byDay = new Map(rows.map((row) => [row.day, row]));
  const trend = [];
  const cursor = new Date(`${dateFrom}T00:00:00`);
  const end = new Date(`${dateTo}T00:00:00`);
  while (cursor <= end) {
    const day = cursor.toISOString().slice(0, 10);
    const row = byDay.get(day);
    trend.push({
      day,
      invoiceCount: Number(row?.invoice_count || 0),
      invoiceAmount: Number(row?.invoice_amount || 0),
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  res.json({ success: true, data: { from: dateFrom, to: dateTo, trend } });
});

[
  "/api/orders",
  "/api/expenses",
  "/api/customer-payments",
  "/api/supplier-payments",
  "/api/staff-payments",
  "/api/staff-records",
  "/api/crp-staff-records",
  "/api/customers",
  "/api/suppliers",
  "/api/staffs",
].forEach((path) => {
  app.get(path, requireAuth, (req, res) => {
    res.json(paginate([], req.query));
  });
});

app.get("/api/invoices", requireAuth, (req, res) => {
  const conditions = ["invoices.business_id = ?"];
  const params = [req.user.business_id];
  const customerName = String(req.query.customer_name || "").trim();
  const dateFrom = String(req.query.date_from || "").trim();
  const dateTo = String(req.query.date_to || "").trim();
  if (customerName) {
    conditions.push("LOWER(invoices.customer_name) LIKE ?");
    params.push(`%${customerName.toLowerCase()}%`);
  }
  if (dateFrom) {
    conditions.push("invoices.invoice_date >= ?");
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push("invoices.invoice_date <= ?");
    params.push(dateTo);
  }
  const rows = db.prepare(`
    SELECT invoices.*,
      (SELECT COUNT(*) FROM invoice_items WHERE invoice_id = invoices.id) AS order_count
    FROM invoices
    WHERE ${conditions.join(" AND ")}
    ORDER BY invoices.invoice_date DESC, invoices.id DESC
  `).all(...params).map((row) => toInvoiceDto(row));
  res.json(paginate(rows, req.query));
});

app.get("/api/invoices/order-groups", requireAuth, (req, res) => {
  res.json({ success: true, data: [], meta: { last_invoice_date: "" } });
});

app.get("/api/invoices/:id", requireAuth, (req, res) => {
  const invoice = db.prepare("SELECT * FROM invoices WHERE id = ? AND business_id = ?")
    .get(req.params.id, req.user.business_id);
  if (!invoice) return res.status(404).json({ message: "Invoice not found" });
  const articles = db.prepare("SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position")
    .all(invoice.id)
    .map(toInvoiceItemDto);
  res.json({ success: true, data: toInvoiceDto(invoice, articles) });
});

app.post("/api/invoices", requireAuth, (req, res) => {
  const customerName = titleCase(req.body?.customer_name);
  const invoiceDate = String(req.body?.invoice_date || new Date().toISOString().slice(0, 10));
  const articles = Array.isArray(req.body?.articles) ? req.body.articles : [];
  if (!customerName) return res.status(400).json({ message: "Customer name is required" });
  if (!articles.length) return res.status(400).json({ message: "At least one article is required" });

  const year = new Date(`${invoiceDate}T00:00:00`).getFullYear();
  if (!Number.isFinite(year)) return res.status(400).json({ message: "Invalid invoice date" });

  const createInvoice = db.transaction(() => {
    const counter = db.prepare(`
      SELECT MAX(CAST(SUBSTR(invoice_number, 6) AS INTEGER)) AS last_no
      FROM invoices WHERE business_id = ? AND invoice_number LIKE ?
    `).get(req.user.business_id, `${year}-%`);
    const business = db.prepare("SELECT invoice_counter_year, invoice_counter_last FROM businesses WHERE id = ?")
      .get(req.user.business_id);
    const configuredLast = Number(business?.invoice_counter_year) === year
      ? Number(business?.invoice_counter_last || 0)
      : 0;
    const nextNo = Math.max(Number(counter?.last_no || 0), configuredLast) + 1;
    const invoiceNumber = `${year}-${String(nextNo).padStart(4, "0")}`;

    const normalizedArticles = articles.map((article, index) => normalizeInvoiceItem(article, index));
    const totalAmount = normalizedArticles.reduce((sum, article) => sum + article.amount, 0);
    const timestamp = now();
    const result = db.prepare(`
      INSERT INTO invoices (
        business_id, created_by, invoice_number, invoice_date, customer_name,
        customer_phone, customer_address, total_amount, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.business_id,
      req.user.id,
      invoiceNumber,
      invoiceDate,
      customerName,
      String(req.body?.customer_phone || "").trim(),
      String(req.body?.customer_address || "").trim(),
      totalAmount,
      timestamp,
      timestamp
    );

    const insertItem = db.prepare(`
      INSERT INTO invoice_items (
        invoice_id, position, size, description, dzn, pcs, rate,
        discount, discount_amount, amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    normalizedArticles.forEach((article) => {
      insertItem.run(
        result.lastInsertRowid,
        article.position,
        article.size,
        article.description,
        article.dzn,
        article.pcs,
        article.rate,
        article.discount,
        article.discount_amount,
        article.amount
      );
    });
    db.prepare("UPDATE businesses SET invoice_counter_year = ?, invoice_counter_last = ?, updated_at = ? WHERE id = ?")
      .run(year, nextNo, timestamp, req.user.business_id);

    const invoice = db.prepare("SELECT * FROM invoices WHERE id = ?").get(result.lastInsertRowid);
    return toInvoiceDto(invoice, normalizedArticles.map((article, index) => ({ ...article, _id: String(index + 1) })));
  });

  res.status(201).json({ success: true, data: createInvoice.immediate() });
});

function filterUsers(rows, query) {
  let filtered = [...rows];
  const name = String(query.name || "").toLowerCase().trim();
  const status = String(query.status || "").toLowerCase().trim();
  if (name) filtered = filtered.filter((row) => String(row.name || "").toLowerCase().includes(name));
  if (status === "active") filtered = filtered.filter((row) => row.isActive);
  if (status === "inactive") filtered = filtered.filter((row) => !row.isActive);
  return filtered;
}

function statsResponse(rows) {
  const total = rows.length;
  const active = rows.filter((row) => Boolean(row.is_active)).length;
  return { success: true, data: { total, active, inactive: total - active } };
}

function toggleUserStatus(id, businessId, res) {
  const user = businessId
    ? db.prepare("SELECT * FROM users WHERE id = ? AND business_id = ?").get(id, businessId)
    : db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!user) return res.status(404).json({ message: "User not found" });
  const next = user.is_active ? 0 : 1;
  db.prepare("UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?").run(next, now(), id);
  res.json({ id: String(id), isActive: Boolean(next) });
}

function resetPassword(id, password, businessId, res) {
  const cleanPassword = String(password || "").trim();
  if (!cleanPassword) return res.status(400).json({ message: "New password is required" });
  const user = businessId
    ? db.prepare("SELECT * FROM users WHERE id = ? AND business_id = ?").get(id, businessId)
    : db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!user) return res.status(404).json({ message: "User not found" });
  db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
    .run(bcrypt.hashSync(cleanPassword, 10), now(), id);
  res.json({ success: true });
}

function titleCase(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function discountAmount(discount, gross) {
  const raw = String(discount || "").trim();
  if (!raw) return 0;
  if (raw.endsWith("%")) {
    return Math.min(gross, Math.max(0, gross * Number(raw.slice(0, -1) || 0) / 100));
  }
  return Math.min(gross, Math.max(0, Number(raw || 0)));
}

function normalizeInvoiceItem(article, index) {
  const pcs = Math.max(0, Number(article?.pcs || 0));
  const dzn = Math.max(0, Number(article?.dzn || 0));
  const rate = Math.max(0, Number(article?.rate || 0));
  const gross = pcs * rate;
  const discount = String(article?.discount || "").trim();
  const calculatedDiscount = discountAmount(discount, gross);
  return {
    position: index + 1,
    size: String(article?.size || "").trim(),
    description: titleCase(article?.description),
    dzn,
    pcs,
    rate,
    discount,
    discount_amount: calculatedDiscount,
    amount: Math.max(0, gross - calculatedDiscount),
  };
}

function toInvoiceItemDto(row) {
  return {
    _id: String(row.id),
    size: row.size || "",
    description: row.description || "",
    dzn: Number(row.dzn || 0),
    pcs: Number(row.pcs || 0),
    rate: Number(row.rate || 0),
    discount: row.discount || "",
    discount_amount: Number(row.discount_amount || 0),
    amount: Number(row.amount || 0),
  };
}

app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.path}` });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ message: "Server error" });
});

app.listen(PORT, () => {
  console.log(`TexTradeOS backend running on http://localhost:${PORT}`);
  console.log("Seed logins: developer/developer123, admin/admin123, staff/staff123");
});
