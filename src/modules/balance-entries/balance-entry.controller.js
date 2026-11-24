import { createBalanceEntry, listBalanceEntryDtos } from "./balance-entry.service.js";

const send = (res, action) => {
  try { return action(); }
  catch (error) { return res.status(error.statusCode || 500).json({ message: error.message || "Balance entry operation failed" }); }
};

export const BalanceEntryController = {
  list: (req, res) => send(res, () => res.json({ success: true, data: listBalanceEntryDtos(req.user.business_id) })),
  create: (req, res) => send(res, () => res.status(201).json({ success: true, data: createBalanceEntry(req.user.business_id, req.user.id, req.body) })),
};
