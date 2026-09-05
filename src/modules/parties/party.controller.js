import { createParty, listPartyDtos, toggleParty, updateParty } from "./party.service.js";

const send = (res, action) => {
  try { return action(); }
  catch (error) { return res.status(error.statusCode || 500).json({ message: error.message || "Party operation failed" }); }
};

export const PartyController = {
  list: (kind) => (req, res) => send(res, () => res.json({ success: true, data: listPartyDtos(kind, req.user.business_id) })),
  create: (kind) => (req, res) => send(res, () => res.status(201).json({ success: true, data: createParty(kind, req.user.business_id, req.body) })),
  update: (kind) => (req, res) => send(res, () => res.json({ success: true, data: updateParty(kind, req.user.business_id, req.params.id, req.body) })),
  toggle: (kind) => (req, res) => send(res, () => res.json({ success: true, data: toggleParty(kind, req.user.business_id, req.params.id) })),
};
