import { body, param, ValidationChain } from "express-validator";

export const customChatIdValidetor: ValidationChain = param("customChatId")
  .notEmpty()
  .withMessage("customChatId is required")
  .isString()
  .withMessage("customChatId must be a string")
  .isLength({ min: 15, max: 15 })
  .withMessage("customChatId must be exactly 15 characters");

export const chatLockPinValidator: ValidationChain = body("pin")
  .notEmpty()
  .withMessage("pin is required")
  .isString()
  .withMessage("pin must be a string")
  .isLength({ min: 6, max: 6 })
  .withMessage("pin must be exactly 6 characters");
