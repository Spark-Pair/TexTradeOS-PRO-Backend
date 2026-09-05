import { now } from "../../utils.js";
import { PaymentModel } from "./payment.model.js";

const text = (value) => String(value ?? "").trim();
const num = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const methods = new Set(["cash", "cheque", "slip", "online"]);

export function syncInvoicePaymentTotals(businessId, invoiceId) {
  const invoice = PaymentModel.findInvoice(businessId, invoiceId);
  if (!invoice) return;
  const received = PaymentModel.total(invoiceId);
  const payable = Math.max(0, num(invoice.net_amount) - num(invoice.sales_return_amount));
  PaymentModel.updateInvoiceTotals(invoiceId, [received, Math.max(0, payable - received), Math.max(0, received - payable), received <= 0 ? "unpaid" : received < payable ? "partial" : "paid", now()]);
}

export function addInvoicePayment({ businessId, userId, invoiceId, payment = {} }) {
  if (!PaymentModel.findInvoice(businessId, invoiceId)) throw Object.assign(new Error("Invoice not found"), { status: 404 });
  const method = text(payment.method).toLowerCase();
  const amount = num(payment.amount);
  if (!methods.has(method)) throw Object.assign(new Error("Invalid payment method"), { status: 400 });
  if (amount <= 0) throw Object.assign(new Error("Payment amount must be greater than zero"), { status: 400 });
  const ts = now();
  const result = PaymentModel.insert([businessId, invoiceId, userId, text(payment.payment_date) || ts.slice(0, 10), method, amount, text(payment.reference_no), text(payment.account_name), text(payment.bank_name), text(payment.cheque_no), text(payment.cheque_date), text(payment.slip_no), text(payment.transaction_id), text(payment.notes), JSON.stringify(payment.metadata || {}), ts, ts]);
  syncInvoicePaymentTotals(businessId, invoiceId);
  return PaymentModel.findById(result.lastInsertRowid);
}

export function listInvoicePayments(businessId, invoiceId) {
  if (!PaymentModel.findInvoice(businessId, invoiceId)) throw Object.assign(new Error("Invoice not found"), { status: 404 });
  return PaymentModel.list(businessId, invoiceId);
}
