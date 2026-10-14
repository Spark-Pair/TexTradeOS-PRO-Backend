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
    const supplierPayments = { count: Number(data.supplierPayments?.count || 0), amount: Number(data.supplierPayments?.amount || 0) };
    const receivables = Math.max(0, Number(data.receivables?.amount || 0));
    const payables = Math.max(0, Number(data.payables?.amount || 0));
    const inventory = getInventory(businessId);
    const availableInventory = inventory.filter((row) => Number(row.stock_pcs || 0) > 0);
    const stockValue = availableInventory.reduce((sum, row) => sum + Number(row.stock_pcs || 0) * Number(row.purchase_rate || 0), 0);
    const stockSaleValue = availableInventory.reduce((sum, row) => sum + Number(row.stock_pcs || 0) * Number(row.sale_rate || 0), 0);
    const cashFlowRows = new Map();
    const addFlow = (rows, key) => (rows || []).forEach((row) => { const day = row.day; const current = cashFlowRows.get(day) || { day, sales: 0, receipts: 0, expenses: 0, purchases: 0, supplierPayments: 0 }; current[key] = Number(row.amount || 0); cashFlowRows.set(day, current); });
    addFlow(data.owner?.cashFlow?.sales, "sales"); addFlow(data.owner?.cashFlow?.receipts, "receipts"); addFlow(data.owner?.cashFlow?.expenses, "expenses"); addFlow(data.owner?.cashFlow?.purchases, "purchases"); addFlow(data.owner?.cashFlow?.supplierPayments, "supplierPayments");
    const cashFlow = Array.from(cashFlowRows.values()).sort((a, b) => String(a.day).localeCompare(String(b.day))).map((row) => ({ ...row, net: row.receipts - row.expenses - row.supplierPayments }));
    const monthNetCashFlow = cashFlow.reduce((sum, row) => sum + row.net, 0);
    const monthOutstanding = (data.details?.invoices || []).filter((row) => Number(row.balance_amount || 0) > 0);
    const lowStock = availableInventory.filter((row) => Number(row.stock_pkt || 0) <= 1).slice(0, 8).map((row) => ({ article_no: row.article_no, description: row.description, packets: Number(row.stock_pkt || 0) }));
    const deadStock = availableInventory.filter((row) => Number(row.sold_pcs || 0) <= 0).slice(0, 8).map((row) => ({ article_no: row.article_no, description: row.description, value: Number(row.stock_pcs || 0) * Number(row.purchase_rate || 0) }));
    const now = new Date();
    const ageDays = (date) => Math.max(0, Math.floor((now - new Date(`${date}T00:00:00`)) / 86400000));
    const aging = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    const agingInvoices = (data.owner?.agingInvoices || []).map((row) => { const days = ageDays(row.invoice_date); const bucket = days <= 30 ? "0-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "90+"; aging[bucket] += Number(row.balance_amount || 0); return { invoice_number: row.invoice_number, customer_name: row.customer_name, balance: Number(row.balance_amount || 0), invoice_date: row.invoice_date, ageDays: days }; });
    const overdueInvoices = agingInvoices.filter((row) => row.ageDays > 30).slice(0, 8);
    const previous = { monthSales: Number(data.owner?.previousInvoices?.amount || 0), monthReceived: Number(data.owner?.previousPayments?.amount || 0), monthExpenses: Number(data.owner?.previousExpenses?.amount || 0) };
    const change = (current, prior) => prior ? ((current - prior) / Math.abs(prior)) * 100 : (current ? 100 : 0);
    const rows = [
      { key: "invoices", label: "Invoices", count: invoices.count, amount: invoices.amount, inflow: invoices.received, outflow: 0, balance: invoices.balance },
      { key: "purchases", label: "Purchases", count: purchases.count, amount: purchases.amount, inflow: 0, outflow: purchases.amount, balance: purchases.amount },
      { key: "expenses", label: "Expenses", count: expenses.count, amount: expenses.amount, inflow: 0, outflow: expenses.amount, balance: expenses.amount },
      { key: "payments", label: "Payments Received", count: paymentsReceived.count, amount: paymentsReceived.amount, inflow: paymentsReceived.amount, outflow: 0, balance: paymentsReceived.amount },
    ];
    const monthSales = Number(data.owner?.monthInvoices?.amount || 0);
    const monthReceived = Number(data.owner?.monthPayments?.amount || 0);
    const owner = { todaySales: Number(data.owner?.todayInvoices?.amount || 0), todaySalesCount: Number(data.owner?.todayInvoices?.count || 0), todayReceived: Number(data.owner?.todayInvoices?.received || 0), todayExpenses: Number(data.owner?.todayExpenses?.amount || 0), monthSales, monthSalesCount: Number(data.owner?.monthInvoices?.count || 0), monthReceived, monthExpenses: Number(data.owner?.monthExpenses?.amount || 0), creditSales: Math.max(0, monthSales - Number(data.owner?.monthInvoices?.received || 0)), averageInvoice: Number(data.owner?.monthInvoices?.count || 0) ? monthSales / Number(data.owner?.monthInvoices?.count || 0) : 0, netCash: monthReceived - Number(data.owner?.monthExpenses?.amount || 0), comparisons: { monthSales: change(monthSales, previous.monthSales), monthReceived: change(monthReceived, previous.monthReceived), monthExpenses: change(Number(data.owner?.monthExpenses?.amount || 0), previous.monthExpenses) }, aging, overdueTotal: overdueInvoices.reduce((sum, row) => sum + row.balance, 0), agingInvoices, dueThisWeek: agingInvoices.filter((row) => row.ageDays >= 23 && row.ageDays <= 30).reduce((sum, row) => sum + row.balance, 0), cashFlow, topCustomers: (data.owner?.topCustomers || []).map((row) => ({ ...row, balance: Math.max(0, Number(row.balance || 0)) })), topSuppliers: (data.owner?.topSuppliers || []).map((row) => ({ ...row, balance: Math.max(0, Number(row.balance || 0)) })), topArticles: data.owner?.topArticles || [], lowStock, deadStock, overdueInvoices, recentPayments: data.details?.payments || [], recentExpenses: data.owner?.recentExpenses || data.details?.expenses || [], recentPurchases: data.owner?.recentPurchases || data.details?.purchases || [] };
    return { success: true, data: { from: dateFrom, to: dateTo, owner, snapshot: { currentReceivables: receivables, currentPayables: payables, currentStockPurchase: stockValue, currentStockSales: stockSaleValue, invoices, purchases, expenses, paymentsReceived, supplierPayments, monthNetCashFlow, outstanding: { count: monthOutstanding.length, amount: monthOutstanding.reduce((sum, row) => sum + Number(row.balance_amount || 0), 0) }, inventory: { count: availableInventory.length, pieces: availableInventory.reduce((sum, row) => sum + Number(row.stock_pcs || 0), 0), value: stockValue } }, details: { ...data.details, inventory: availableInventory.map((row) => ({ article_no: row.article_no, description: row.description, supplier_name: row.supplier_name, stock_pcs: Number(row.stock_pcs || 0), stock_pkt: Number(row.stock_pkt || 0), stock_value: Number(row.stock_pcs || 0) * Number(row.purchase_rate || 0) })) }, rows, totals: { count: rows.reduce((sum, row) => sum + row.count, 0), amount: rows.reduce((sum, row) => sum + row.amount, 0), inflow: rows.reduce((sum, row) => sum + row.inflow, 0), outflow: rows.reduce((sum, row) => sum + row.outflow, 0), balance: rows.reduce((sum, row) => sum + row.balance, 0) } } };
  },
};
