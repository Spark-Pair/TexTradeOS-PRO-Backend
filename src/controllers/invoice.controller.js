import { InvoiceService } from "../services/invoice.service.js";

const send = (res, action, status = 200) => {
  try { return res.status(status).json(action()); }
  catch (error) { return res.status(error.status || 500).json({ message: error.message || "Invoice operation failed" }); }
};

export const InvoiceController = {
  list: (req, res) => send(res, () => InvoiceService.list(req.user.business_id, req.query)),
  orderGroups: (req, res) => send(res, () => InvoiceService.orderGroups()),
  sharedLedger: (req, res) => send(res, () => InvoiceService.sharedLedger(req.user.business_id)),
  get: (req, res) => send(res, () => InvoiceService.get(req.params.id, req.user.business_id)),
  create: (req, res) => send(res, () => InvoiceService.create(req.user, req.body), 201),
  delete: (req, res) => send(res, () => InvoiceService.delete(req.params.id, req.user)),
};
