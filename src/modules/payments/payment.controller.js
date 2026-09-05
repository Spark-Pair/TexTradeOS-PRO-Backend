import { addInvoicePayment, listInvoicePayments } from "./payment.service.js";

const send = (res, action) => {
  try { return action(); }
  catch (error) { return res.status(error.status || 500).json({ message: error.message || "Payment operation failed" }); }
};

export const PaymentController = {
  list: (req, res) => send(res, () => res.json({ success: true, data: listInvoicePayments(req.user.business_id, req.params.invoiceId) })),
  create: (req, res) => send(res, () => res.status(201).json({ success: true, data: addInvoicePayment({ businessId: req.user.business_id, userId: req.user.id, invoiceId: req.params.invoiceId, payment: req.body }) })),
};
