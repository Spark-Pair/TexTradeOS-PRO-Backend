import "dotenv/config";
import fs from "node:fs";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, defaultReferenceData, defaultRuleData, parseJson, toInvoiceDto, toUserDto } from "./db.js";
import { newSessionId, requireAuth, requireBusinessAdmin, requireDeveloper, signAccessToken, signRefreshToken } from "./auth.js";
import { requireLicense, validateLicense } from "./license.js";
import { checkForUpdate, getPendingMandatoryUpdate, requestUpdate } from "./updates.js";
import {
  listBackups,
  readFingerprint,
  readLauncherLog,
  readLauncherResult,
  submitLauncherCommand,
} from "./management.js";
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
  SELECT users.*, businesses.name AS business_name,
    (SELECT COUNT(*) FROM invoices WHERE invoices.created_by = users.id) AS created_invoice_count
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
    app: "TexTradeOS PRO Backend",
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

app.get("/api/setup/status", (req, res) => {
  const license = validateLicense();
  res.json({ license, version: APP_VERSION });
});

app.get("/api/setup/fingerprint", (req, res) => {
  try {
    const fingerprint = readFingerprint();
    res.setHeader("Content-Disposition", "attachment; filename=TexTradeOS-PRO-Fingerprint.json");
    res.json(fingerprint);
  } catch {
    res.status(404).json({ message: "Device fingerprint is not available" });
  }
});

app.post("/api/setup/license", (req, res) => {
  if (!req.body?.payload || !req.body?.signature) {
    return res.status(400).json({ message: "Select a valid TexTradeOS PRO license file" });
  }
  res.status(202).json(submitLauncherCommand("import-license", { document: req.body }));
});

app.get("/api/setup/commands/:id", (req, res) => {
  const result = readLauncherResult(req.params.id);
  res.json(result || { id: req.params.id, state: "pending" });
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
    db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(now(), sessionId);
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

app.get("/api/system/status", requireAuth, requireBusinessAdmin, asyncHandler(async (req, res) => {
  const update = await checkForUpdate();
  const databaseStats = fs.statSync(process.env.DATABASE_PATH || "./textradeos.sqlite");
  res.json({
    version: APP_VERSION,
    license: validateLicense(),
    update,
    databaseSize: databaseStats.size,
    backups: listBackups(),
  });
}));

app.get("/api/system/diagnostics", requireAuth, requireBusinessAdmin, (req, res) => {
  const databasePath = process.env.DATABASE_PATH || "./textradeos.sqlite";
  const diagnostics = {
    generatedAt: new Date().toISOString(),
    version: APP_VERSION,
    node: process.version,
    platform: process.platform,
    license: validateLicense(),
    database: {
      path: databasePath,
      size: fs.existsSync(databasePath) ? fs.statSync(databasePath).size : 0,
    },
    backups: listBackups(),
    launcherLog: readLauncherLog(),
  };
  res.setHeader("Content-Disposition", "attachment; filename=TexTradeOS-PRO-Diagnostics.json");
  res.json(diagnostics);
});

app.post("/api/system/commands", requireAuth, requireBusinessAdmin, (req, res) => {
  const type = String(req.body?.type || "");
  const allowed = new Set(["backup", "restore", "firewall"]);
  if (!allowed.has(type)) return res.status(400).json({ message: "Unsupported system operation" });
  if (type === "restore" && !/^textradeos-\d{8}-\d{6}\.sqlite$/i.test(String(req.body?.backup || ""))) {
    return res.status(400).json({ message: "Select a valid backup" });
  }
  const payload = type === "restore" ? { backup: req.body.backup } : {};
  res.status(202).json(submitLauncherCommand(type, payload));
});

app.get("/api/system/commands/:id", requireAuth, requireBusinessAdmin, (req, res) => {
  const result = readLauncherResult(req.params.id);
  res.json(result || { id: req.params.id, state: "pending" });
});

app.use("/api", (req, res, next) => {
  const update = getPendingMandatoryUpdate();
  if (!update) return next();
  return res.status(503).json({
    code: "MANDATORY_UPDATE_REQUIRED",
    message: `TexTradeOS PRO ${update.version} must be installed before continuing.`,
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
  const rows = db.prepare(`
    ${userSelect}
    WHERE users.business_id = ? AND users.role <> 'developer'
    ORDER BY users.updated_at DESC
  `).all(req.user.business_id).map(toUserDto);
  const filtered = filterUsers(rows, req.query);
  res.json(paginate(filtered, req.query));
});

app.get("/api/users/business/stats", requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT is_active
    FROM users
    WHERE business_id = ? AND role <> 'developer'
  `).all(req.user.business_id);
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

app.delete("/api/users/business/:id", requireAuth, requireBusinessAdmin, (req, res) => {
  deleteUser(req.params.id, req.user.business_id, req.user.id, res);
});

app.delete("/api/users/:id", requireAuth, requireDeveloper, (req, res) => {
  deleteUser(req.params.id, null, req.user.id, res);
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
  const customerUrduTitle = String(req.body?.customer_urdu_title || "").trim();
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
    const totals = invoiceTotals(
      normalizedArticles,
      req.body?.sales_return_amount,
      req.body?.received_amount
    );
    const timestamp = now();
    const result = db.prepare(`
      INSERT INTO invoices (
        business_id, created_by, invoice_number, invoice_date, customer_name,
        customer_urdu_title, customer_phone, customer_address, gross_amount,
        percent_discount_amount, rupee_discount_amount, total_discount_amount,
        net_amount, sales_return_amount, received_amount, balance_amount,
        return_amount, total_amount, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.business_id,
      req.user.id,
      invoiceNumber,
      invoiceDate,
      customerName,
      customerUrduTitle,
      String(req.body?.customer_phone || "").trim(),
      String(req.body?.customer_address || "").trim(),
      totals.gross_amount,
      totals.percent_discount_amount,
      totals.rupee_discount_amount,
      totals.total_discount_amount,
      totals.net_amount,
      totals.sales_return_amount,
      totals.received_amount,
      totals.balance_amount,
      totals.return_amount,
      totals.total_amount,
      timestamp,
      timestamp
    );

    const insertItem = db.prepare(`
      INSERT INTO invoice_items (
        invoice_id, position, size, description, dzn, pcs, rate, gross_amount,
        discount, discount_type, discount_amount, amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        article.gross_amount,
        article.discount,
        article.discount_type,
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

app.delete("/api/invoices/:id", requireAuth, (req, res) => {
  if (req.user.role !== "developer" && req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }

  const invoice = req.user.role === "developer"
    ? db.prepare("SELECT id FROM invoices WHERE id = ?").get(req.params.id)
    : db.prepare("SELECT id FROM invoices WHERE id = ? AND business_id = ?")
      .get(req.params.id, req.user.business_id);
  if (!invoice) return res.status(404).json({ message: "Invoice not found" });

  db.transaction(() => {
    db.prepare("DELETE FROM invoice_items WHERE invoice_id = ?").run(invoice.id);
    db.prepare("DELETE FROM invoices WHERE id = ?").run(invoice.id);
  }).immediate();

  res.json({ success: true });
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
    ? db.prepare("SELECT * FROM users WHERE id = ? AND business_id = ? AND role <> 'developer'").get(id, businessId)
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
    ? db.prepare("SELECT * FROM users WHERE id = ? AND business_id = ? AND role <> 'developer'").get(id, businessId)
    : db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!user) return res.status(404).json({ message: "User not found" });
  db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
    .run(bcrypt.hashSync(cleanPassword, 10), now(), id);
  res.json({ success: true });
}

function deleteUser(id, businessId, currentUserId, res) {
  if (String(id) === String(currentUserId)) {
    return res.status(400).json({ message: "You cannot delete your own user account" });
  }

  const user = businessId
    ? db.prepare("SELECT * FROM users WHERE id = ? AND business_id = ? AND role <> 'developer'").get(id, businessId)
    : db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!user) return res.status(404).json({ message: "User not found" });

  const invoiceCount = db.prepare("SELECT COUNT(*) AS count FROM invoices WHERE created_by = ?")
    .get(user.id).count;
  if (Number(invoiceCount) > 0) {
    return res.status(409).json({
      message: "This user cannot be deleted because they have created invoices",
    });
  }

  db.prepare("DELETE FROM users WHERE id = ?").run(user.id);

  return res.json({ success: true, id: String(user.id) });
}

function titleCase(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function numberValue(value) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function discountDetails(discount, pcs, rate) {
  const raw = String(discount || "").trim();
  if (!raw) return { amount: 0, type: "" };
  const pieces = Math.max(0, numberValue(pcs));
  const unitRate = Math.max(0, numberValue(rate));
  if (!pieces || !unitRate) return { amount: 0, type: raw.endsWith("%") ? "percent" : "rupee" };

  if (raw.endsWith("%")) {
    const percentage = Math.min(100, Math.max(0, numberValue(raw.slice(0, -1))));
    return {
      amount: pieces * (unitRate * percentage / 100),
      type: "percent",
    };
  }
  return {
    amount: pieces * Math.min(unitRate, Math.max(0, numberValue(raw))),
    type: "rupee",
  };
}

function invoiceTotals(articles, salesReturnInput, receivedInput) {
  const grossAmount = articles.reduce((sum, article) => sum + Number(article.gross_amount || 0), 0);
  const percentDiscountAmount = articles.reduce(
    (sum, article) => sum + (article.discount_type === "percent" ? Number(article.discount_amount || 0) : 0),
    0
  );
  const rupeeDiscountAmount = articles.reduce(
    (sum, article) => sum + (article.discount_type === "rupee" ? Number(article.discount_amount || 0) : 0),
    0
  );
  const totalDiscountAmount = percentDiscountAmount + rupeeDiscountAmount;
  const netAmount = Math.max(0, grossAmount - totalDiscountAmount);
  const salesReturnAmount = Math.min(netAmount, Math.max(0, numberValue(salesReturnInput)));
  const receivedAmount = Math.max(0, numberValue(receivedInput));
  const totalAmount = Math.max(0, netAmount - salesReturnAmount);
  return {
    gross_amount: grossAmount,
    percent_discount_amount: percentDiscountAmount,
    rupee_discount_amount: rupeeDiscountAmount,
    total_discount_amount: totalDiscountAmount,
    net_amount: netAmount,
    sales_return_amount: salesReturnAmount,
    received_amount: receivedAmount,
    total_amount: totalAmount,
    balance_amount: Math.max(0, totalAmount - receivedAmount),
    return_amount: Math.max(0, receivedAmount - totalAmount),
  };
}

function normalizeInvoiceItem(article, index) {
  const pcs = Math.max(0, Number(article?.pcs || 0));
  const dzn = Math.max(0, Number(article?.dzn || 0));
  const rate = Math.max(0, Number(article?.rate || 0));
  const gross = pcs * rate;
  const discount = String(article?.discount || "").trim();
  const calculatedDiscount = discountDetails(discount, pcs, rate);
  const discountAmount = Math.min(gross, calculatedDiscount.amount);
  return {
    position: index + 1,
    size: String(article?.size || "").trim(),
    description: titleCase(article?.description),
    dzn,
    pcs,
    rate,
    gross_amount: gross,
    discount,
    discount_type: calculatedDiscount.type,
    discount_amount: discountAmount,
    amount: Math.max(0, gross - discountAmount),
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
    gross_amount: Number(row.gross_amount || (Number(row.pcs || 0) * Number(row.rate || 0))),
    discount: row.discount || "",
    discount_type: row.discount_type || "",
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
  console.log(`TexTradeOS PRO backend running on http://localhost:${PORT}`);
  console.log("Fresh-install logins: developer/developer123, admin/admin123");
});
