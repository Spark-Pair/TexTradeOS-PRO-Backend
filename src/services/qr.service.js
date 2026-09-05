import crypto from "node:crypto";
import { db } from "../db.js";

const loadQrSecret = () => {
  if (process.env.QR_CODE_SECRET) return process.env.QR_CODE_SECRET;

  db.exec("CREATE TABLE IF NOT EXISTS app_secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL, created_at TEXT NOT NULL)");
  const stored = db.prepare("SELECT value FROM app_secrets WHERE key = ?").get("article_qr_v1");
  if (stored?.value) return stored.value;

  const secret = crypto.randomBytes(48).toString("base64url");
  db.prepare("INSERT INTO app_secrets (key, value, created_at) VALUES (?, ?, ?)")
    .run("article_qr_v1", secret, new Date().toISOString());
  return secret;
};

const QR_SECRET = loadQrSecret();
const qrKey = crypto.createHash("sha256").update(QR_SECRET).digest();

db.exec(`CREATE TABLE IF NOT EXISTS article_qr_codes (
  qr_id TEXT PRIMARY KEY,
  article_no TEXT NOT NULL,
  purchase_number TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
)`);

export const ArticleQrService = {
  create({ articleNo, qrId, purchaseNumber }) {
    const id = String(qrId || "").trim();
    if (!id || !articleNo) throw new Error("Article number and permanent QR ID are required");

    const existing = db.prepare("SELECT * FROM article_qr_codes WHERE qr_id = ?").get(id);
    if (existing) {
      if (existing.article_no !== String(articleNo)) {
        throw new Error("Permanent QR identity is already assigned to another article");
      }
      return existing.code;
    }

    const token = crypto.randomBytes(6).toString("base64url");
    const signature = crypto.createHmac("sha256", qrKey).update(token).digest("base64url").slice(0, 6);
    const code = `T1.${token}.${signature}`;

    db.prepare("INSERT OR IGNORE INTO article_qr_codes (qr_id, article_no, purchase_number, code, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, String(articleNo), String(purchaseNumber || ""), code, new Date().toISOString());

    const saved = db.prepare("SELECT * FROM article_qr_codes WHERE qr_id = ?").get(id);
    if (!saved || saved.article_no !== String(articleNo)) {
      throw new Error("Permanent QR identity is already assigned to another article");
    }
    return saved.code;
  },

  verify(value) {
    const raw = String(value || "").trim();
    const [prefix, token, signature, extra] = raw.split(".");
    if (!["T1", "TTO1"].includes(prefix) || !token || !signature || ![6, 11, 22].includes(signature.length) || extra) {
      throw new Error("Not a TexTradeOS QR code");
    }

    const expected = crypto.createHmac("sha256", qrKey).update(token).digest("base64url").slice(0, signature.length);
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      throw new Error("Invalid QR signature");
    }

    const record = db.prepare("SELECT * FROM article_qr_codes WHERE code = ?").get(raw);
    if (!record) throw new Error("Unknown QR code");
    return { articleNo: record.article_no, qrId: record.qr_id, purchaseNumber: record.purchase_number };
  },
};
