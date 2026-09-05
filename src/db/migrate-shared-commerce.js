import { db, parseJson } from "../db.js";

const text = (value) => String(value || "").trim();
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const timestamp = (value) => text(value) || new Date().toISOString();

const insertParty = (kind, businessId, row) => {
  const table = kind === "customers" ? "customers" : "suppliers";
  const nameColumn = kind === "customers" ? "customer_name" : "supplier_name";
  const name = text(row?.[nameColumn]);
  const id = text(row?._id);
  if (!id || !name) return;
  db.prepare(`INSERT OR IGNORE INTO ${table} (id,business_id,${nameColumn},person_name,urdu_title,phone_number,address,city,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id,businessId,name,text(row.person_name),text(row.urdu_title),text(row.phone_number),text(row.address),text(row.city),row.isActive === false ? 0 : 1,timestamp(row.createdAt),timestamp(row.updatedAt || row.createdAt));
};

const validSupplierId = (businessId, value) => {
  const id = text(value);
  if (!id) return null;
  return db.prepare("SELECT id FROM suppliers WHERE business_id = ? AND id = ?").get(businessId, id)?.id || null;
};

const insertPurchase = (businessId, row) => {
  const id = text(row?._id);
  const purchaseNumber = text(row?.purchase_number);
  const supplierName = text(row?.supplier_name);
  if (!id || !purchaseNumber || !supplierName) return;
  const articles = Array.isArray(row.articles) ? row.articles : [];
  const createdAt = timestamp(row.createdAt);
  const updatedAt = timestamp(row.updatedAt || row.createdAt);
  const supplierId = validSupplierId(businessId, row.supplier_id);
  const result = db.prepare(`INSERT OR IGNORE INTO purchases (id,business_id,created_by,purchase_number,purchase_date,supplier_id,supplier_name,notes,total_amount,article_count,packet_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id,businessId,null,purchaseNumber,text(row.purchase_date) || createdAt.slice(0,10),supplierId,supplierName,text(row.notes),number(row.total_amount),articles.length,number(row.packet_count),createdAt,updatedAt);
  if (!result.changes) return;
  const insertItem = db.prepare(`INSERT OR IGNORE INTO purchase_items (purchase_id,position,article_no,qr_id,description,size,season,category,unit,quantity_dzn,quantity_pcs,quantity_pkt,rate,sale_rate,discount,discount_amount,amount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  articles.forEach((item,index) => {
    const articleNo = text(item?.article_no);
    const qrId = text(item?.qr_id);
    if (!articleNo || !qrId) return;
    insertItem.run(id,index,articleNo,qrId,text(item.description),text(item.size),text(item.season),text(item.category),number(item.unit),number(item.quantity_dzn),number(item.quantity_pcs ?? item.total_pcs),number(item.quantity_pkt),number(item.rate),number(item.sale_rate),text(item.discount),number(item.discount_amount),number(item.amount));
  });
};

export function migrateSharedCommerceData() {
  db.exec(`CREATE TABLE IF NOT EXISTS app_migrations (migration_key TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`);
  const key = "shared-commerce-to-relational-v1";
  if (db.prepare("SELECT 1 FROM app_migrations WHERE migration_key = ?").get(key)) return;

  db.transaction(() => {
    const rows = db.prepare("SELECT business_id, collection, payload FROM shared_collections WHERE collection IN ('customers','suppliers','purchases') ORDER BY business_id, collection").all();
    for (const source of rows) {
      const records = parseJson(source.payload, []);
      if (!Array.isArray(records)) continue;
      if (source.collection === "customers" || source.collection === "suppliers") records.forEach((row) => insertParty(source.collection, source.business_id, row));
      if (source.collection === "purchases") records.forEach((row) => insertPurchase(source.business_id, row));
    }
    db.prepare("INSERT INTO app_migrations (migration_key, applied_at) VALUES (?, ?)").run(key, new Date().toISOString());
  }).immediate();
}
