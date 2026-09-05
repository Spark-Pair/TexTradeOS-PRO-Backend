import { Router } from "express";
import { ReturnController } from "./return.controller.js";

export function createReturnRouter(requireAuth) {
  const router=Router();
  router.use(requireAuth);
  router.get("/sales/returnable/:partyId",ReturnController.returnable);
  router.get("/:type",ReturnController.list);
  router.get("/:type/:id",ReturnController.get);
  router.post("/:type",ReturnController.create);
  router.delete("/:type/:id",ReturnController.delete);
  return router;
}
