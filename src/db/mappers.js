export const parseJson = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

export const toUserDto = (row) => {
  if (!row) return null;
  return {
    _id: String(row.id),
    id: String(row.id),
    businessId: row.business_id ? String(row.business_id) : null,
    business: row.business_id ? { id: String(row.business_id), name: row.business_name || "" } : null,
    business_name: row.business_name || "",
    name: row.name,
    username: row.username,
    role: row.role,
    isActive: Boolean(row.is_active),
    createdInvoiceCount: Number(row.created_invoice_count || 0),
    shortcuts: parseJson(row.shortcuts, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export const toInvoiceDto = (row, articles = []) => {
  if (!row) return null;
  const lineGross = articles.reduce((sum, article) => sum + Number(article.gross_amount || 0), 0);
  const lineDiscount = articles.reduce((sum, article) => sum + Number(article.discount_amount || 0), 0);
  const grossAmount = Number(row.gross_amount || lineGross || row.total_amount || 0);
  const totalDiscountAmount = Number(row.total_discount_amount || lineDiscount || 0);
  const netAmount = Number(row.net_amount || Math.max(0, grossAmount - totalDiscountAmount));
  const salesReturnAmount = Number(row.sales_return_amount || 0);
  const totalAmount = Number(row.total_amount || Math.max(0, netAmount - salesReturnAmount));
  const receivedAmount = Number(row.received_amount || 0);
  return {
    _id: String(row.id),
    id: String(row.id),
    business_id: String(row.business_id),
    invoice_number: row.invoice_number,
    invoice_date: row.invoice_date,
    customer_name: row.customer_name,
    customer_urdu_title: row.customer_urdu_title || "",
    salesman_name: row.salesman_name || "",
    customer_phone: row.customer_phone || "",
    customer_address: row.customer_address || "",
    order_count: articles.length || Number(row.order_count || 0),
    articles,
    gross_amount: grossAmount,
    percent_discount_amount: Number(row.percent_discount_amount || 0),
    rupee_discount_amount: Number(row.rupee_discount_amount || 0),
    total_discount_amount: totalDiscountAmount,
    net_amount: netAmount,
    sales_return_amount: salesReturnAmount,
    received_amount: receivedAmount,
    balance_amount: Number(row.balance_amount || Math.max(0, totalAmount - receivedAmount)),
    return_amount: Number(row.return_amount || Math.max(0, receivedAmount - totalAmount)),
    total_amount: totalAmount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};
