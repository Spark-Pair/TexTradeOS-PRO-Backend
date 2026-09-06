import { db } from "../db/connection.js";

export const DashboardModel = {
  invoiceTrend(businessId, dateFrom, dateTo) {
    return db.prepare(`SELECT invoice_date AS day, COUNT(*) AS invoice_count, COALESCE(SUM(total_amount), 0) AS invoice_amount FROM invoices WHERE business_id = ? AND invoice_date BETWEEN ? AND ? GROUP BY invoice_date ORDER BY invoice_date`).all(businessId, dateFrom, dateTo);
  },
};
