import { Router } from "express";
import { verifyJWTMiddleware } from "../middleware/auth/jwtValidate.middleware.js";
import {
  getAllSessionsController,
  logoutAllSessionsController,
  logoutSpecificSessionController,
} from "../controllers/auth.controllers.js";
const router = Router();

router.get("/devices", verifyJWTMiddleware, getAllSessionsController);
router.post("/logout-all", verifyJWTMiddleware, logoutAllSessionsController);
router.post(
  "/devices/:sessionId",
  verifyJWTMiddleware,
  logoutSpecificSessionController,
);
export default router;
