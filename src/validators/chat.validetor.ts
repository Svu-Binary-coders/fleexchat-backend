import { body, param, ValidationChain } from "express-validator";

export const customChatIdValidetor: ValidationChain = param("customChatId")
  .notEmpty()
  .withMessage("customChatId is required")
  .isString()
  .withMessage("customChatId must be a string")
  .isLength({ min: 10, max: 10 })
  .withMessage("customChatId must be exactly 10 characters");

export const chatLockPinValidator: ValidationChain = body("pin")
  .notEmpty()
  .withMessage("pin is required")
  .isString()
  .withMessage("pin must be a string")
  .isLength({ min: 6, max: 50 })
  .withMessage("pin must be between 6 and 50 characters");
