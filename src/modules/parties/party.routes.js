import express from "express";
import { PartyController } from "./party.controller.js";

export function createPartyRouter(requireAuth) {
  const router = express.Router();
  router.use(requireAuth);
  router.get("/payments", PartyController.payments);

  for (const kind of ["customers", "suppliers"]) {
    router.get(`/${kind}`, PartyController.list(kind));
    router.get(`/${kind}/:id/statement`, PartyController.statement(kind));
    router.post(`/${kind}/:id/payments`, PartyController.payment(kind));
    router.post(`/${kind}`, PartyController.create(kind));
    router.put(`/${kind}/:id`, PartyController.update(kind));
    router.patch(`/${kind}/:id/toggle-status`, PartyController.toggle(kind));
  }
  return router;
}
