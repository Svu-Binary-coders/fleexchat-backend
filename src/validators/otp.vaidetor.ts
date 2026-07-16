import { body, ValidationChain } from "express-validator";

export const validateEmailForOTP: ValidationChain = body("email")
  .isEmail()
  .withMessage("Please provide a valid email address")
  .normalizeEmail();

export const verifyOTPValidation: ValidationChain = body("otp")
  .isLength({ min: 6, max: 6 })
  .withMessage("OTP must be exactly 6 digits")
  .isNumeric()
  .withMessage("OTP must be a number");
