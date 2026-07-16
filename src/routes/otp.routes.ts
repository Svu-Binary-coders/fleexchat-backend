import { Router } from "express";
const router = Router();
import {
  sendForgetPasswordOTP,
  sendRegisterOTP,
  verifyForgetPasswordOTP,
  verifyRegisterOTP,
} from "../services/otp.controllers.js";
import {
  validateEmailForOTP,
  verifyOTPValidation,
} from "../validators/otp.vaidetor.js";
import { validateExpress } from "../validators/validateExpress.validetor.js";

router.post("/send-otp", validateEmailForOTP, validateExpress, sendRegisterOTP);

router.post(
  "/verify-otp",
  validateEmailForOTP,
  verifyOTPValidation,
  validateExpress,
  verifyRegisterOTP,
);

// forget password otp
router.post(
  "/send-forget-password-otp",
  validateEmailForOTP,
  validateExpress,
  sendForgetPasswordOTP,
);

router.post(
  "/verify-forget-password-otp",
  validateEmailForOTP,
  verifyOTPValidation,
  validateExpress,
  verifyForgetPasswordOTP,
);


export default router;
