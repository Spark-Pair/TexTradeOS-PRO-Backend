import { createBankAccount, listBankAccountDtos, toggleBankAccount, updateBankAccount } from "./bank-account.service.js";
const send = (res, action) => { try { return action(); } catch (error) { return res.status(error.statusCode || 500).json({ message: error.message || "Bank account operation failed" }); } };
export const BankAccountController = {
  list: (req, res) => send(res, () => res.json({ success: true, data: listBankAccountDtos(req.user.business_id) })),
  create: (req, res) => send(res, () => res.status(201).json({ success: true, data: createBankAccount(req.user.business_id, req.body) })),
  update: (req, res) => send(res, () => res.json({ success: true, data: updateBankAccount(req.user.business_id, req.params.id, req.body) })),
  toggle: (req, res) => send(res, () => res.json({ success: true, data: toggleBankAccount(req.user.business_id, req.params.id) })),
};
