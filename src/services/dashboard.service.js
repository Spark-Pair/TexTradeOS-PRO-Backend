import { DashboardModel } from "../models/dashboard.model.js";
import { getInventory } from "../modules/inventory/inventory.service.js";

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
  summary(businessId, dateFromInput, dateToInput) {
    const dateFrom = String(dateFromInput || "").trim();
    const dateTo = String(dateToInput || "").trim();
    if (!dateFrom || !dateTo) throw fail(400, "date_from and date_to are required");
    const data = DashboardModel.monthSummary(businessId, dateFrom, dateTo);
    const invoices = { count: Number(data.invoices?.count || 0), amount: Number(data.invoices?.amount || 0), received: Number(data.invoices?.received || 0), balance: Number(data.invoices?.balance || 0) };
    const purchases = { count: Number(data.purchases?.count || 0), amount: Number(data.purchases?.amount || 0) };
    const expenses = { count: Number(data.expenses?.count || 0), amount: Number(data.expenses?.amount || 0) };
    const paymentsReceived = { count: Number(data.paymentsReceived?.count || 0), amount: Number(data.paymentsReceived?.amount || 0) };
    const receivables = Math.max(0, Number(data.receivables?.amount || 0));
    const payables = Math.max(0, Number(data.payables?.amount || 0));
    const inventory = getInventory(businessId);
    const availableInventory = inventory.filter((row) => Number(row.stock_pcs || 0) > 0);
    const stockValue = availableInventory.reduce((sum, row) => sum + Number(row.stock_pcs || 0) * Number(row.purchase_rate || 0), 0);
    const rows = [
      { key: "invoices", label: "Invoices", count: invoices.count, amount: invoices.amount, inflow: invoices.received, outflow: 0, balance: invoices.balance },
      { key: "purchases", label: "Purchases", count: purchases.count, amount: purchases.amount, inflow: 0, outflow: purchases.amount, balance: purchases.amount },
      { key: "expenses", label: "Expenses", count: expenses.count, amount: expenses.amount, inflow: 0, outflow: expenses.amount, balance: expenses.amount },
      { key: "payments", label: "Payments Received", count: paymentsReceived.count, amount: paymentsReceived.amount, inflow: paymentsReceived.amount, outflow: 0, balance: paymentsReceived.amount },
    ];
    return { success: true, data: { from: dateFrom, to: dateTo, snapshot: { currentReceivables: receivables, currentPayables: payables, currentStockPurchase: availableInventory.reduce((sum, row) => sum + Number(row.stock_pcs || 0) * Number(row.purchase_rate || 0), 0), currentStockSales: availableInventory.reduce((sum, row) => sum + Number(row.stock_pcs || 0) * Number(row.sale_rate || 0), 0), invoices, purchases, expenses, paymentsReceived, outstanding: { count: invoices.balance > 0 ? invoices.count : 0, amount: invoices.balance }, inventory: { count: availableInventory.length, pieces: availableInventory.reduce((sum, row) => sum + Number(row.stock_pcs || 0), 0), value: stockValue } }, details: { ...data.details, inventory: availableInventory.map((row) => ({ article_no: row.article_no, description: row.description, supplier_name: row.supplier_name, stock_pcs: Number(row.stock_pcs || 0), stock_pkt: Number(row.stock_pkt || 0), stock_value: Number(row.stock_pcs || 0) * Number(row.purchase_rate || 0) })) }, rows, totals: { count: rows.reduce((sum, row) => sum + row.count, 0), amount: rows.reduce((sum, row) => sum + row.amount, 0), inflow: rows.reduce((sum, row) => sum + row.inflow, 0), outflow: rows.reduce((sum, row) => sum + row.outflow, 0), balance: rows.reduce((sum, row) => sum + row.balance, 0) } } };
  },
};
