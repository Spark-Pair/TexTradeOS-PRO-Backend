import { Router } from "express";
import { UserController } from "../controllers/user.controller.js";
import { requireAuth, requireBusinessAdmin, requireDeveloper } from "../middleware/auth.middleware.js";

const router = Router();
router.use(requireAuth);

router.get("/", requireDeveloper, UserController.listAll);
router.get("/stats", requireDeveloper, UserController.allStats);
router.get("/business", UserController.listBusiness);
router.get("/business/stats", UserController.businessStats);
router.post("/business", requireBusinessAdmin, UserController.createBusiness);
router.patch("/business/:id/toggle-status", requireBusinessAdmin, UserController.toggleBusiness);
router.patch("/:id/toggle-status", requireDeveloper, UserController.toggleAny);
router.patch("/business/:id/reset-password", requireBusinessAdmin, UserController.resetBusinessPassword);
router.patch("/:id/reset-password", requireDeveloper, UserController.resetAnyPassword);
router.delete("/business/:id", requireBusinessAdmin, UserController.deleteBusiness);
router.delete("/:id", requireDeveloper, UserController.deleteAny);
router.get("/active-sessions", requireDeveloper, UserController.activeSessions);
router.delete("/:id/active-sessions", requireDeveloper, UserController.revokeSessions);

export default router;
