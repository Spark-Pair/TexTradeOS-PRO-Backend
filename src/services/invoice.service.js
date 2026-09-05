import { toInvoiceDto } from "../db.js";
import { now, paginate } from "../utils.js";
import { InvoiceModel } from "../models/invoice.model.js";
import { createReturn } from "../modules/returns/return.service.js";
import { addInvoicePayment } from "../modules/payments/payment.service.js";

const fail = (status, message) => Object.assign(new Error(message), { status });
const titleCase = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const numberValue = (value) => { const parsed = Number(String(value ?? "").replace(/,/g, "")); return Number.isFinite(parsed) ? parsed : 0; };

const discountDetails = (discount, pcs, rate) => {
  const raw = String(discount || "").trim();
  if (!raw) return { amount: 0, type: "" };
  const pieces = Math.max(0, numberValue(pcs));
  const unitRate = Math.max(0, numberValue(rate));
  if (!pieces || !unitRate) return { amount: 0, type: raw.endsWith("%") ? "percent" : "rupee" };
  if (raw.endsWith("%")) {
    const percentage = Math.min(100, Math.max(0, numberValue(raw.slice(0, -1))));
    return { amount: pieces * (unitRate * percentage / 100), type: "percent" };
  }
  return { amount: pieces * Math.min(unitRate, Math.max(0, numberValue(raw))), type: "rupee" };
};

const normalizeItem = (article, index) => {
  const pcs = Math.max(0, Number(article?.pcs || 0));
  const dzn = Math.max(0, Number(article?.dzn || 0));
  const rate = Math.max(0, Number(article?.rate || 0));
  const gross = pcs * rate;
  const discount = String(article?.discount || "").trim();
  const calculated = discountDetails(discount, pcs, rate);
  const discountAmount = Math.min(gross, calculated.amount);
  return { position: index + 1, article_no: String(article?.article_no || "").trim(), purchase_number: String(article?.purchase_number || "").trim(), size: String(article?.size || "").trim(), description: titleCase(article?.description), unit: Math.max(0, Number(article?.unit || 0)), quantity_pkt: Math.max(0, Number(article?.quantity_pkt || 0)), purchase_rate: Math.max(0, Number(article?.purchase_rate || 0)), dzn, pcs, rate, gross_amount: gross, discount, discount_type: calculated.type, discount_amount: discountAmount, amount: Math.max(0, gross - discountAmount) };
};

const totals = (articles, salesReturnInput, receivedInput) => {
  const gross = articles.reduce((s, a) => s + Number(a.gross_amount || 0), 0);
  const percent = articles.reduce((s, a) => s + (a.discount_type === "percent" ? Number(a.discount_amount || 0) : 0), 0);
  const rupee = articles.reduce((s, a) => s + (a.discount_type === "rupee" ? Number(a.discount_amount || 0) : 0), 0);
  const discount = percent + rupee;
  const net = Math.max(0, gross - discount);
  const salesReturn = Math.min(net, Math.max(0, numberValue(salesReturnInput)));
  const received = Math.max(0, numberValue(receivedInput));
  const total = Math.max(0, net - salesReturn);
  return { gross_amount: gross, percent_discount_amount: percent, rupee_discount_amount: rupee, total_discount_amount: discount, net_amount: net, sales_return_amount: salesReturn, received_amount: received, total_amount: total, balance_amount: Math.max(0, total - received), return_amount: Math.max(0, received - total) };
};

const itemDto = (row) => ({ _id: String(row.id), article_no: row.article_no || "", purchase_number: row.purchase_number || "", size: row.size || "", description: row.description || "", unit: Number(row.unit || 0), quantity_pkt: Number(row.quantity_pkt || 0), purchase_rate: Number(row.purchase_rate || 0), dzn: Number(row.dzn || 0), pcs: Number(row.pcs || 0), rate: Number(row.rate || 0), gross_amount: Number(row.gross_amount || (Number(row.pcs || 0) * Number(row.rate || 0))), discount: row.discount || "", discount_type: row.discount_type || "", discount_amount: Number(row.discount_amount || 0), amount: Number(row.amount || 0) });

export const InvoiceService = {
  list(businessId, query) {
    return paginate(InvoiceModel.list(businessId, { customerName: String(query.customer_name || "").trim(), dateFrom: String(query.date_from || "").trim(), dateTo: String(query.date_to || "").trim() }), query);
  },
  orderGroups() { return { success: true, data: [], meta: { last_invoice_date: "" } }; },
  sharedLedger(businessId) { return { success: true, data: InvoiceModel.allForLedger(businessId).map((invoice) => toInvoiceDto(invoice, InvoiceModel.items(invoice.id).map(itemDto))) }; },
  get(id, businessId) { const invoice = InvoiceModel.find(id, businessId); if (!invoice) throw fail(404, "Invoice not found"); return { success: true, data: toInvoiceDto(invoice, InvoiceModel.items(invoice.id).map(itemDto)) }; },

  create(user, body = {}) {
    const customerName = titleCase(body.customer_name);
    const invoiceDate = String(body.invoice_date || new Date().toISOString().slice(0, 10));
    const articles = Array.isArray(body.articles) ? body.articles : [];
    if (!customerName) throw fail(400, "Customer name is required");
    if (!articles.length) throw fail(400, "At least one article is required");
    const year = new Date(`${invoiceDate}T00:00:00`).getFullYear();
    if (!Number.isFinite(year)) throw fail(400, "Invalid invoice date");

    const transaction = InvoiceModel.transaction(() => {
      const counter = InvoiceModel.counterLast(user.business_id, year);
      const business = InvoiceModel.businessCounter(user.business_id);
      const configuredLast = Number(business?.invoice_counter_year) === year ? Number(business?.invoice_counter_last || 0) : 0;
      const nextNo = Math.max(Number(counter?.last_no || 0), configuredLast) + 1;
      const invoiceNumber = `${year}-${String(nextNo).padStart(4, "0")}`;
      const normalized = articles.map(normalizeItem);
      const calculated = totals(normalized, body.sales_return_amount, body.received_amount);
      const timestamp = now();
      const result = InvoiceModel.insert([user.business_id, user.id, invoiceNumber, invoiceDate, customerName, String(body.customer_urdu_title || "").trim(), titleCase(body.salesman_name), String(body.customer_phone || "").trim(), String(body.customer_address || "").trim(), calculated.gross_amount, calculated.percent_discount_amount, calculated.rupee_discount_amount, calculated.total_discount_amount, calculated.net_amount, calculated.sales_return_amount, calculated.received_amount, calculated.balance_amount, calculated.return_amount, calculated.total_amount, String(body.customer_id || "").trim() || null, body.customer_kind === "walk_in" ? "walk_in" : "registered", String(body.walk_in_person || "").trim(), "unpaid", timestamp, timestamp]);
      const invoiceId = Number(result.lastInsertRowid);
      InvoiceModel.insertItems(invoiceId, normalized);
      if (body.sales_return && Array.isArray(body.sales_return.articles) && body.sales_return.articles.length) {
        const record = createReturn({ businessId: user.business_id, userId: user.id, type: "sales", body: { ...body.sales_return, return_date: body.sales_return.return_date || invoiceDate, party_id: String(body.customer_id || "").trim(), party_name: customerName, linked_invoice_id: invoiceId } });
        InvoiceModel.setSalesReturnAmount(invoiceId, record.total_amount);
      }
      if (body.payment && Number(body.payment.amount || 0) > 0) addInvoicePayment({ businessId: user.business_id, userId: user.id, invoiceId, payment: body.payment });
      InvoiceModel.updateCounter(user.business_id, year, nextNo, timestamp);
      return toInvoiceDto(InvoiceModel.findAny(invoiceId), normalized.map((article, index) => ({ ...article, _id: String(index + 1) })));
    });
    return { success: true, data: transaction.immediate() };
  },

  delete(id, user) {
    if (!["developer", "admin"].includes(user.role)) throw fail(403, "Admin access required");
    const invoice = user.role === "developer" ? InvoiceModel.findAny(id) : InvoiceModel.find(id, user.business_id);
    if (!invoice) throw fail(404, "Invoice not found");
    InvoiceModel.delete(invoice.id);
    return { success: true };
  },
};
