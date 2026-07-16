import { body, query, ValidationChain } from "express-validator";
export const validateUserId: ValidationChain = query("userId")
  .notEmpty()
  .withMessage("userId is required")
  .isString()
  .withMessage("userId must be a string")
  .isLength({ min: 5, max: 15 })
  .withMessage("userId must be between 5 and 15 characters long")
  .matches(/^[a-zA-Z][a-zA-Z0-9_]*$/)
  .withMessage(
    "userId must start with a letter and contain only letters, numbers, and underscores",
  )
  .matches(/[0-9_]/)
  .withMessage("userId must contain at least one number or underscore");

export const validateRegisterUser: ValidationChain[] = [
  body("name")
    .notEmpty()
    .withMessage("Name is required")
    .isString()
    .withMessage("Name must be a string")
    .isLength({ min: 2, max: 50 })
    .withMessage("Name must be between 2 and 50 characters long"),

  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email format"),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long")
    .matches(/[A-Z]/)
    .withMessage("Password must contain at least one uppercase letter")
    .matches(/[a-z]/)
    .withMessage("Password must contain at least one lowercase letter")
    .matches(/[0-9]/)
    .withMessage("Password must contain at least one number")
    .matches(/[\W_]/)
    .withMessage("Password must contain at least one special character"),

  body("userId")
    .notEmpty()
    .withMessage("userId is required")
    .isString()
    .withMessage("userId must be a string")
    .isLength({ min: 5, max: 15 })
    .withMessage("userId must be between 5 and 15 characters long")
    .matches(/^[a-zA-Z][a-zA-Z0-9_]*$/)
    .withMessage("userId must start with a letter and contain only letters, numbers, and underscores"),

  body("fingerprintId")
    .notEmpty()
    .withMessage("fingerprintId is required")
    .isString()
    .withMessage("fingerprintId must be a string")
    .isLength({ min: 10, max: 100 })
    .withMessage("fingerprintId must be between 10 and 100 characters long"),

  body("rememberMe")
    .optional()
    .isBoolean()
    .withMessage("rememberMe must be a boolean")
    .custom((value) => {
      if (typeof value === "string") {
        return (
          value === "true" ||
          value === "false" ||
          value === "1" ||
          value === "0"
        );
      }
      return true;
    }),
];

export const validateLoginUser: ValidationChain[] = [
  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email format"),

  body("fingerprintId")
    .notEmpty()
    .withMessage("fingerprintId is required")
    .isString()
    .withMessage("fingerprintId must be a string")
    .isLength({ min: 10, max: 100 })
    .withMessage("fingerprintId must be between 10 and 100 characters long"),

  body("rememberMe")
    .optional()
    .isBoolean()
    .withMessage("rememberMe must be a boolean")
    .custom((value) => {
      if (typeof value === "string") {
        return (
          value === "true" ||
          value === "false" ||
          value === "1" ||
          value === "0"
        );
      }
      return true;
    }),
];
