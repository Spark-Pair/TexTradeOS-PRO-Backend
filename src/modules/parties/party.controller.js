import { createParty, createPartyPayment, getPartyStatement, listPartyDtos, listPaymentDtos, toggleParty, updateParty } from "./party.service.js";

const send = (res, action) => { try { return action(); } catch (error) { return res.status(error.statusCode || 500).json({ message: error.message || "Party operation failed" }); } };

export const PartyController = {
  payments: (req, res) => send(res, () => res.json({ success: true, data: listPaymentDtos(req.user.business_id, req.query) })),
  list: (kind) => (req, res) => send(res, () => res.json({ success: true, data: listPartyDtos(kind, req.user.business_id) })),
  statement: (kind) => (req, res) => send(res, () => res.json({ success: true, data: getPartyStatement(kind, req.user.business_id, req.params.id, { date_from: req.query.date_from, date_to: req.query.date_to }) })),
  payment: (kind) => (req, res) => send(res, () => res.status(201).json({ success: true, data: createPartyPayment(kind, req.user.business_id, req.user.id, req.params.id, req.body) })),
  create: (kind) => (req, res) => send(res, () => res.status(201).json({ success: true, data: createParty(kind, req.user.business_id, req.body) })),
  update: (kind) => (req, res) => send(res, () => res.json({ success: true, data: updateParty(kind, req.user.business_id, req.params.id, req.body) })),
  toggle: (kind) => (req, res) => send(res, () => res.json({ success: true, data: toggleParty(kind, req.user.business_id, req.params.id) })),
};
