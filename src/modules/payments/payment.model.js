import { db } from "../../db/connection.js";

export const PaymentModel = {
  findInvoice(businessId, invoiceId) {
    return db.prepare("SELECT id,net_amount,sales_return_amount FROM invoices WHERE id=? AND business_id=?").get(invoiceId, businessId);
  },
  insert(values) {
    return db.prepare(`INSERT INTO invoice_payments (business_id,invoice_id,created_by,payment_date,method,amount,reference_no,account_name,bank_name,cheque_no,cheque_date,slip_no,transaction_id,notes,metadata,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...values);
  },
  findById(id) { return db.prepare("SELECT * FROM invoice_payments WHERE id=?").get(id); },
  total(invoiceId) { return Number(db.prepare("SELECT COALESCE(SUM(amount),0) amount FROM invoice_payments WHERE invoice_id=?").get(invoiceId)?.amount || 0); },
  updateInvoiceTotals(invoiceId, values) {
    return db.prepare("UPDATE invoices SET received_amount=?,balance_amount=?,return_amount=?,payment_status=?,updated_at=? WHERE id=?").run(...values, invoiceId);
  },
  list(businessId, invoiceId) {
    return db.prepare("SELECT * FROM invoice_payments WHERE business_id=? AND invoice_id=? ORDER BY payment_date,id").all(businessId, invoiceId);
  },
};
