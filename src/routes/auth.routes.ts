import { Router } from "express";
const router = Router();
import {
  isUserIdAvailable,
  registerUser,
  loginUser,
  getUserDetails,
  logoutUser,
  clearCookiesController,
  logoutSpecificSessionController,
  updateUserProfileController,
  getAllSessionsController,
  logoutAllSessionsController,
} from "../controllers/auth.controllers.js";
import { validateExpress } from "../validators/validateExpress.validetor.js";
import {
  bioValidetor,
  nameValidetor,
  validateLoginUser,
  validateRegisterUser,
  validateUserId,
  websiteValidetor,
} from "../validators/auth.validetor.js";
import { verifyJWTMiddleware } from "../middleware/auth/jwtValidate.middleware.js";

router.get("/check-userId", validateUserId, validateExpress, isUserIdAvailable);
router.post("/register", validateRegisterUser, validateExpress, registerUser);
router.post("/login", validateLoginUser, validateExpress, loginUser);
router.get("/me", verifyJWTMiddleware, getUserDetails);
router.patch(
  "/update-profile",
  nameValidetor,
  bioValidetor,
  websiteValidetor,
  validateExpress,
  verifyJWTMiddleware,
  updateUserProfileController,
);

router.delete("/logout", verifyJWTMiddleware, logoutUser);
router.delete("/clear-cookies", verifyJWTMiddleware, clearCookiesController);
router.delete(
  "/delete-session/:sessionId",
  verifyJWTMiddleware,
  logoutSpecificSessionController,
);
router.delete("/delete-all", verifyJWTMiddleware, logoutAllSessionsController);

router.get("/sessions", verifyJWTMiddleware, getAllSessionsController);

export default router;
