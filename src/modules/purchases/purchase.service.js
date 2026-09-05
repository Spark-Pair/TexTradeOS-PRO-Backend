import crypto from "node:crypto";
import { getParty } from "../parties/party.model.js";
import { getPurchase, getPurchaseItems, listPurchases, removePurchase, savePurchaseRecord } from "./purchase.model.js";

const text = (value) => String(value || "").trim();
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const itemDto = (row) => ({ article_no: row.article_no, qr_id: row.qr_id, description: row.description || "", size: row.size || "", season: row.season || "", category: row.category || "", unit: number(row.unit), quantity_dzn: number(row.quantity_dzn), quantity_pcs: number(row.quantity_pcs), quantity_pkt: number(row.quantity_pkt), rate: number(row.rate), sale_rate: number(row.sale_rate), discount: row.discount || "", discount_amount: number(row.discount_amount), amount: number(row.amount) });
const dto = (row) => row ? ({ _id: row.id, purchase_number: row.purchase_number, purchase_date: row.purchase_date, supplier_id: row.supplier_id || "", supplier_name: row.supplier_name, notes: row.notes || "", total_amount: number(row.total_amount), article_count: number(row.article_count), packet_count: number(row.packet_count), createdAt: row.created_at, updatedAt: row.updated_at, articles: getPurchaseItems(row.id).map(itemDto) }) : null;

export const listPurchaseDtos = (businessId) => listPurchases(businessId).map(dto);
export const getPurchaseDto = (businessId, id) => dto(getPurchase(businessId, id));

export const savePurchase = (businessId, userId, payload = {}, id = "") => {
  const existing = id ? getPurchase(businessId, id) : null;
  if (id && !existing) throw Object.assign(new Error("Purchase not found"), { statusCode: 404 });

  const supplierId = text(payload.supplier_id);
  const supplier = supplierId ? getParty("suppliers", businessId, supplierId) : null;
  if (supplierId && !supplier) throw Object.assign(new Error("Supplier not found for this business"), { statusCode: 404 });
  const supplierName = supplier?.supplier_name || text(payload.supplier_name);
  const articles = Array.isArray(payload.articles) ? payload.articles : [];
  if (!supplierName) throw Object.assign(new Error("Supplier is required"), { statusCode: 400 });
  if (!articles.length) throw Object.assign(new Error("At least one article is required"), { statusCode: 400 });

  const purchaseDate = text(payload.purchase_date) || new Date().toISOString().slice(0, 10);
  const year = new Date(`${purchaseDate}T00:00:00`).getFullYear();
  if (!Number.isFinite(year)) throw Object.assign(new Error("Invalid purchase date"), { statusCode: 400 });

  const normalizedItems = articles.map((item) => {
    const suppliedArticle = text(item.article_no);
    return { ...item, article_no: suppliedArticle && !suppliedArticle.includes("PREVIEW") ? suppliedArticle : "", qr_id: text(item.qr_id) || crypto.randomUUID(), description: text(item.description), size: text(item.size), season: text(item.season), category: text(item.category), unit: number(item.unit), quantity_dzn: number(item.quantity_dzn), quantity_pcs: number(item.quantity_pcs ?? item.total_pcs), quantity_pkt: number(item.quantity_pkt), rate: number(item.rate), sale_rate: number(item.sale_rate), discount: text(item.discount), discount_amount: number(item.discount_amount), amount: number(item.amount) };
  });
  const timestamp = new Date().toISOString();
  const row = savePurchaseRecord(businessId, userId, { id: existing?.id || crypto.randomUUID(), purchase_number: existing?.purchase_number || "", purchase_date: purchaseDate, supplier_id: supplierId || null, supplier_name: supplierName, notes: text(payload.notes), total_amount: normalizedItems.reduce((sum,item) => sum + item.amount, 0), packet_count: normalizedItems.reduce((sum,item) => sum + item.quantity_pkt, 0), created_at: existing?.created_at || timestamp, updated_at: timestamp }, normalizedItems, { allocateNumbers: !existing, year });
  return dto(row);
};

export const deletePurchase = (businessId, id) => {
  if (!removePurchase(businessId, id)) throw Object.assign(new Error("Purchase not found"), { statusCode: 404 });
};
