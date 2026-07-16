import { Router } from "express";
const router = Router();
import {
  isUserIdAvailable,
  registerUser,
  loginUser,
  getUserDetails,
  logoutUser,
  logoutSpecificSessionController,
} from "../controllers/auth.controllers.js";
import { validateExpress } from "../validators/validateExpress.validetor.js";
import {
  validateLoginUser,
  validateRegisterUser,
  validateUserId,
} from "../validators/auth.validetor.js";
import { verifyJWTMiddleware } from "../middleware/auth/jwtValidate.middleware.js";

router.get("/check-userId", validateUserId, validateExpress, isUserIdAvailable);
router.post("/register", validateRegisterUser, validateExpress, registerUser);
router.post("/login", validateLoginUser, validateExpress, loginUser);
router.get("/me", verifyJWTMiddleware, getUserDetails);

router.delete("/logout", verifyJWTMiddleware, logoutUser);
router.delete(
  "/logout-specific/:sessionId",
  verifyJWTMiddleware,
  logoutSpecificSessionController,
);
router.delete("/logout-all", verifyJWTMiddleware, logoutUser);

router.get("/sessions", verifyJWTMiddleware, getUserDetails);

export default router;
