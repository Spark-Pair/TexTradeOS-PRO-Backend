import { db } from "../db/connection.js";

export const DashboardModel = {
  invoiceTrend(businessId, dateFrom, dateTo) {
    return db.prepare(`SELECT invoice_date AS day, COUNT(*) AS invoice_count, COALESCE(SUM(total_amount), 0) AS invoice_amount FROM invoices WHERE business_id = ? AND invoice_date BETWEEN ? AND ? GROUP BY invoice_date ORDER BY invoice_date`).all(businessId, dateFrom, dateTo);
  },
  monthSummary(businessId, dateFrom, dateTo) {
    const invoices = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS amount, COALESCE(SUM(received_amount), 0) AS received, COALESCE(SUM(balance_amount), 0) AS balance FROM invoices WHERE business_id = ? AND invoice_date BETWEEN ? AND ?`).get(businessId, dateFrom, dateTo);
    const purchases = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS amount FROM purchases WHERE business_id = ? AND purchase_date BETWEEN ? AND ?`).get(businessId, dateFrom, dateTo);
    const expenses = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount FROM expenses WHERE business_id = ? AND expense_date BETWEEN ? AND ?`).get(businessId, dateFrom, dateTo);
    const paymentsReceived = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(ip.amount), 0) AS amount FROM invoice_payments ip JOIN invoices i ON i.id = ip.invoice_id WHERE ip.business_id = ? AND ip.payment_date BETWEEN ? AND ?`).get(businessId, dateFrom, dateTo);
    const receivables = db.prepare(`SELECT
      COALESCE((SELECT SUM(net_amount) FROM invoices WHERE business_id = ?), 0)
      - COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE business_id = ?), 0)
      - COALESCE((SELECT SUM(amount) FROM party_payments WHERE business_id = ? AND party_type = 'customer'), 0)
      - COALESCE((SELECT SUM(total_amount) FROM returns WHERE business_id = ? AND return_type = 'sales'), 0) AS amount`).get(businessId, businessId, businessId, businessId);
    const payables = db.prepare(`SELECT
      COALESCE((SELECT SUM(total_amount) FROM purchases WHERE business_id = ?), 0)
      - COALESCE((SELECT SUM(total_amount) FROM returns WHERE business_id = ? AND return_type = 'purchase'), 0)
      - COALESCE((SELECT SUM(amount) FROM party_payments WHERE business_id = ? AND party_type = 'supplier'), 0) AS amount`).get(businessId, businessId, businessId);
    const invoiceDetails = db.prepare(`SELECT invoice_number, customer_name, invoice_date, total_amount, received_amount, balance_amount, payment_status FROM invoices WHERE business_id = ? AND invoice_date BETWEEN ? AND ? ORDER BY invoice_date DESC, id DESC`).all(businessId, dateFrom, dateTo);
    const purchaseDetails = db.prepare(`SELECT purchase_number, supplier_name, purchase_date, total_amount, article_count, packet_count FROM purchases WHERE business_id = ? AND purchase_date BETWEEN ? AND ? ORDER BY purchase_date DESC, created_at DESC`).all(businessId, dateFrom, dateTo);
    const expenseDetails = db.prepare(`SELECT expense_date, category, paid_to, amount, method FROM expenses WHERE business_id = ? AND expense_date BETWEEN ? AND ? ORDER BY expense_date DESC, id DESC`).all(businessId, dateFrom, dateTo);
    return { invoices, purchases, expenses, paymentsReceived, receivables, payables, details: { invoices: invoiceDetails, purchases: purchaseDetails, expenses: expenseDetails } };
  },
};
