import express from "express";
import { PartyController } from "./party.controller.js";

export function createPartyRouter(requireAuth) {
  const router = express.Router();
  router.use(requireAuth);

  for (const kind of ["customers", "suppliers"]) {
    router.get(`/${kind}`, PartyController.list(kind));
    router.post(`/${kind}`, PartyController.create(kind));
    router.put(`/${kind}/:id`, PartyController.update(kind));
    router.patch(`/${kind}/:id/toggle-status`, PartyController.toggle(kind));
  }
  return router;
}
