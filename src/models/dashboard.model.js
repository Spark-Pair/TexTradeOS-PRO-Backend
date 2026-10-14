import { db } from "../db/connection.js";

export const DashboardModel = {
  invoiceTrend(businessId, dateFrom, dateTo) {
    return db.prepare(`SELECT invoice_date AS day, COUNT(*) AS invoice_count, COALESCE(SUM(total_amount), 0) AS invoice_amount FROM invoices WHERE business_id = ? AND invoice_date BETWEEN ? AND ? GROUP BY invoice_date ORDER BY invoice_date`).all(businessId, dateFrom, dateTo);
  },
  monthSummary(businessId, dateFrom, dateTo) {
    const invoices = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS amount, COALESCE(SUM(received_amount), 0) AS received, COALESCE(SUM(balance_amount), 0) AS balance FROM invoices WHERE business_id = ? AND invoice_date BETWEEN ? AND ?`).get(businessId, dateFrom, dateTo);
    const purchases = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS amount FROM purchases WHERE business_id = ? AND purchase_date BETWEEN ? AND ?`).get(businessId, dateFrom, dateTo);
    const expenses = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount FROM expenses WHERE business_id = ? AND expense_date BETWEEN ? AND ?`).get(businessId, dateFrom, dateTo);
    const paymentsReceived = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount FROM (SELECT amount, payment_date FROM invoice_payments WHERE business_id = ? UNION ALL SELECT amount, payment_date FROM party_payments WHERE business_id = ? AND party_type = 'customer') WHERE payment_date BETWEEN ? AND ?`).get(businessId, businessId, dateFrom, dateTo);
    const supplierPayments = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount FROM party_payments WHERE business_id = ? AND party_type = 'supplier' AND payment_date BETWEEN ? AND ?`).get(businessId, dateFrom, dateTo);
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
    const paymentDetails = db.prepare(`SELECT payment_date, amount, method, reference_no, CASE WHEN party_type = 'customer' THEN 'Customer payment' ELSE 'Supplier payment' END AS description FROM party_payments WHERE business_id = ? AND payment_date BETWEEN ? AND ? ORDER BY payment_date DESC, id DESC LIMIT 20`).all(businessId, dateFrom, dateTo);
    const owner = {
      todayInvoices: db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS amount, COALESCE(SUM(received_amount), 0) AS received FROM invoices WHERE business_id = ? AND invoice_date = ?`).get(businessId, new Date().toISOString().slice(0, 10)),
      monthInvoices: db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS amount, COALESCE(SUM(received_amount), 0) AS received FROM invoices WHERE business_id = ? AND invoice_date BETWEEN ? AND ?`).get(businessId, dateFrom, dateTo),
      todayExpenses: db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount FROM expenses WHERE business_id = ? AND expense_date = ?`).get(businessId, new Date().toISOString().slice(0, 10)),
      monthExpenses: db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount FROM expenses WHERE business_id = ? AND expense_date BETWEEN ? AND ?`).get(businessId, dateFrom, dateTo),
      monthPayments: db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount FROM (SELECT ip.amount, ip.payment_date FROM invoice_payments ip WHERE ip.business_id = ? UNION ALL SELECT pp.amount, pp.payment_date FROM party_payments pp WHERE pp.business_id = ? AND pp.party_type = 'customer') WHERE payment_date BETWEEN ? AND ?`).get(businessId, businessId, dateFrom, dateTo),
      previousInvoices: db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS amount FROM invoices WHERE business_id = ? AND invoice_date BETWEEN date(?, '-1 month') AND date(?, '-1 month')`).get(businessId, dateFrom, dateTo),
      previousPayments: db.prepare(`SELECT COALESCE(SUM(amount), 0) AS amount FROM (SELECT ip.amount, ip.payment_date FROM invoice_payments ip WHERE ip.business_id = ? UNION ALL SELECT pp.amount, pp.payment_date FROM party_payments pp WHERE pp.business_id = ? AND pp.party_type = 'customer') WHERE payment_date BETWEEN date(?, '-1 month') AND date(?, '-1 month')`).get(businessId, businessId, dateFrom, dateTo),
      previousExpenses: db.prepare(`SELECT COALESCE(SUM(amount), 0) AS amount FROM expenses WHERE business_id = ? AND expense_date BETWEEN date(?, '-1 month') AND date(?, '-1 month')`).get(businessId, dateFrom, dateTo),
      cashFlow: {
        sales: db.prepare(`SELECT invoice_date AS day, COALESCE(SUM(total_amount), 0) AS amount FROM invoices WHERE business_id = ? AND invoice_date BETWEEN ? AND ? GROUP BY invoice_date`).all(businessId, dateFrom, dateTo),
        receipts: db.prepare(`SELECT payment_date AS day, COALESCE(SUM(amount), 0) AS amount FROM (SELECT ip.amount, ip.payment_date FROM invoice_payments ip WHERE ip.business_id = ? UNION ALL SELECT pp.amount, pp.payment_date FROM party_payments pp WHERE pp.business_id = ? AND pp.party_type = 'customer') WHERE payment_date BETWEEN ? AND ? GROUP BY payment_date`).all(businessId, businessId, dateFrom, dateTo),
        supplierPayments: db.prepare(`SELECT payment_date AS day, COALESCE(SUM(amount), 0) AS amount FROM party_payments WHERE business_id = ? AND party_type = 'supplier' AND payment_date BETWEEN ? AND ? GROUP BY payment_date`).all(businessId, dateFrom, dateTo),
        expenses: db.prepare(`SELECT expense_date AS day, COALESCE(SUM(amount), 0) AS amount FROM expenses WHERE business_id = ? AND expense_date BETWEEN ? AND ? GROUP BY expense_date`).all(businessId, dateFrom, dateTo),
        purchases: db.prepare(`SELECT purchase_date AS day, COALESCE(SUM(total_amount), 0) AS amount FROM purchases WHERE business_id = ? AND purchase_date BETWEEN ? AND ? GROUP BY purchase_date`).all(businessId, dateFrom, dateTo),
      },
      agingInvoices: db.prepare(`SELECT invoice_number, customer_name, invoice_date, balance_amount FROM invoices WHERE business_id = ? AND balance_amount > 0 ORDER BY invoice_date ASC`).all(businessId),
      recentPurchases: db.prepare(`SELECT purchase_number, supplier_name, purchase_date, total_amount FROM purchases WHERE business_id = ? ORDER BY purchase_date DESC, created_at DESC LIMIT 5`).all(businessId),
      recentExpenses: db.prepare(`SELECT expense_date, category, paid_to, amount FROM expenses WHERE business_id = ? ORDER BY expense_date DESC, id DESC LIMIT 5`).all(businessId),
      topCustomers: db.prepare(`SELECT c.customer_name, (COALESCE((SELECT SUM(net_amount) FROM invoices WHERE business_id = c.business_id AND customer_id = c.id), 0) - COALESCE((SELECT SUM(amount) FROM invoice_payments ip JOIN invoices i ON i.id = ip.invoice_id WHERE i.business_id = c.business_id AND i.customer_id = c.id), 0) - COALESCE((SELECT SUM(amount) FROM party_payments WHERE business_id = c.business_id AND party_type = 'customer' AND party_id = c.id), 0) - COALESCE((SELECT SUM(total_amount) FROM returns WHERE business_id = c.business_id AND return_type = 'sales' AND party_id = c.id), 0)) AS balance FROM customers c WHERE c.business_id = ? ORDER BY balance DESC LIMIT 5`).all(businessId),
      topSuppliers: db.prepare(`SELECT s.supplier_name, (COALESCE((SELECT SUM(total_amount) FROM purchases WHERE business_id = s.business_id AND supplier_id = s.id), 0) - COALESCE((SELECT SUM(total_amount) FROM returns WHERE business_id = s.business_id AND return_type = 'purchase' AND party_id = s.id), 0) - COALESCE((SELECT SUM(amount) FROM party_payments WHERE business_id = s.business_id AND party_type = 'supplier' AND party_id = s.id), 0)) AS balance FROM suppliers s WHERE s.business_id = ? ORDER BY balance DESC LIMIT 5`).all(businessId),
      topArticles: db.prepare(`SELECT ii.article_no, MAX(ii.description) AS description, COALESCE(SUM(ii.pcs), 0) AS pieces, COALESCE(SUM(ii.amount), 0) AS amount FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id WHERE i.business_id = ? AND i.invoice_date BETWEEN ? AND ? GROUP BY ii.article_no ORDER BY pieces DESC LIMIT 5`).all(businessId, dateFrom, dateTo),
    };
    return { invoices, purchases, expenses, paymentsReceived, supplierPayments, receivables, payables, owner, details: { invoices: invoiceDetails, purchases: purchaseDetails, expenses: expenseDetails, payments: paymentDetails } };
  },
};
