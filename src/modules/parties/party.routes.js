import express from "express";
import { listPartyDtos, saveParty, toggleParty } from "./party.service.js";

const handle = (res, action) => {
  try { return action(); }
  catch (error) { return res.status(error.statusCode || 500).json({ message: error.message || "Request failed" }); }
};

export function createPartyRouter(requireAuth) {
  const router = express.Router();
  router.use(requireAuth);

  for (const kind of ["customers", "suppliers"]) {
    router.get(`/${kind}`, (req, res) => handle(res, () => res.json({ success: true, data: listPartyDtos(kind, req.user.business_id) })));
    router.post(`/${kind}`, (req, res) => handle(res, () => res.status(201).json({ success: true, data: saveParty(kind, req.user.business_id, req.body) })));
    router.put(`/${kind}/:id`, (req, res) => handle(res, () => res.json({ success: true, data: saveParty(kind, req.user.business_id, { ...req.body, _id: req.params.id }) })));
    router.patch(`/${kind}/:id/toggle-status`, (req, res) => handle(res, () => res.json({ success: true, data: toggleParty(kind, req.user.business_id, req.params.id) })));
  }
  return router;
}
