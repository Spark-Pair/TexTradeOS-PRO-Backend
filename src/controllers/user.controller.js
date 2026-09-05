import { UserService } from "../services/user.service.js";

const send = (res, action, successStatus = 200) => {
  try {
    return res.status(successStatus).json(action());
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "User operation failed" });
  }
};

export const UserController = {
  listAll: (req, res) => send(res, () => UserService.listAll(req.query)),
  allStats: (req, res) => send(res, () => UserService.allStats()),
  listBusiness: (req, res) => send(res, () => UserService.listBusiness(req.user.business_id, req.query)),
  businessStats: (req, res) => send(res, () => UserService.businessStats(req.user.business_id)),
  createBusiness: (req, res) => send(res, () => UserService.createBusinessUser(req.user.business_id, req.body), 201),
  toggleBusiness: (req, res) => send(res, () => UserService.toggleStatus(req.params.id, req.user.business_id)),
  toggleAny: (req, res) => send(res, () => UserService.toggleStatus(req.params.id)),
  resetBusinessPassword: (req, res) => send(res, () => UserService.resetPassword(req.params.id, req.body?.newPassword, req.user.business_id)),
  resetAnyPassword: (req, res) => send(res, () => UserService.resetPassword(req.params.id, req.body?.newPassword)),
  deleteBusiness: (req, res) => send(res, () => UserService.delete(req.params.id, req.user.business_id, req.user.id)),
  deleteAny: (req, res) => send(res, () => UserService.delete(req.params.id, null, req.user.id)),
  activeSessions: (req, res) => send(res, () => UserService.activeSessions()),
  revokeSessions: (req, res) => send(res, () => UserService.revokeSessions(req.params.id)),
};
