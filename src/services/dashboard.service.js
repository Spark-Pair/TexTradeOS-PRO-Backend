import { DashboardModel } from "../models/dashboard.model.js";

const fail = (status, message) => Object.assign(new Error(message), { status });

export const DashboardService = {
  trend(businessId, dateFromInput, dateToInput) {
    const dateFrom = String(dateFromInput || "").trim();
    const dateTo = String(dateToInput || "").trim();
    if (!dateFrom || !dateTo) throw fail(400, "date_from and date_to are required");

    const rows = DashboardModel.invoiceTrend(businessId, dateFrom, dateTo);
    const byDay = new Map(rows.map((row) => [row.day, row]));
    const trend = [];
    const cursor = new Date(`${dateFrom}T00:00:00`);
    const end = new Date(`${dateTo}T00:00:00`);
    while (cursor <= end) {
      const day = cursor.toISOString().slice(0, 10);
      const row = byDay.get(day);
      trend.push({ day, invoiceCount: Number(row?.invoice_count || 0), invoiceAmount: Number(row?.invoice_amount || 0) });
      cursor.setDate(cursor.getDate() + 1);
    }
    return { success: true, data: { from: dateFrom, to: dateTo, trend } };
  },
};
