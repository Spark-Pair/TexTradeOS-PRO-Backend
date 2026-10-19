import { createPaymentClearance, getPaymentClearances } from "./clearance.service.js";

const send = (res, action) => {
  try { return action(); }
  catch (error) { return res.status(error.statusCode || 500).json({ message: error.message || "Clearance operation failed" }); }
};

export const ClearanceController = {
  list: (req, res) => send(res, () => res.json({ success: true, data: getPaymentClearances(req.user.business_id, req.params.source, req.params.paymentId) })),
  create: (req, res) => send(res, () => res.status(201).json({ success: true, data: createPaymentClearance(req.user.business_id, req.user.id, req.params.source, req.params.paymentId, req.body) })),
};
