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
    .withMessage(
      "userId must start with a letter and contain only letters, numbers, and underscores",
    ),

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

export const nameValidetor: ValidationChain = body("name")
  .optional()
  .isString()
  .withMessage("Name must be a string")
  .isLength({ min: 2, max: 50 })
  .withMessage("Name must be between 2 and 50 characters");

export const emailValidetor: ValidationChain = body("email")
  .isEmail()
  .withMessage("Invalid email format")
  .normalizeEmail()
  .notEmpty()
  .withMessage("Email is required");

export const passwordValidetor: ValidationChain = body("password")
  .isString()
  .withMessage("Password must be a string")
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
  .matches(/[@$!%*?&]/)
  .withMessage(
    "Password must contain at least one special character (@, $, !, %, *, ?, &)",
  );

export const OTPValidetor: ValidationChain = body("otp")
  .isString()
  .withMessage("OTP must be a string")
  .notEmpty()
  .withMessage("OTP is required")
  .isLength({ min: 6, max: 6 })
  .withMessage("OTP must be exactly 6 characters long")
  .matches(/^\d{6}$/)
  .withMessage("OTP must contain only digits");

export const rememberMeValidetor: ValidationChain = body("rememberMe")
  .custom((v) => {
    if (typeof v === "boolean") return true;
    if (typeof v === "string") {
      const lower = v.toLowerCase();
      return (
        lower === "yes" ||
        lower === "no" ||
        lower === "true" ||
        lower === "false"
      );
    }
  })
  .withMessage("Remember Me must be a boolean value")
  .isIn([true, false, "yes", "no", "YES", "NO", "True", "False"])
  .withMessage("Remember Me must be either true, false, 'yes', or 'no'");

export const bioValidetor: ValidationChain = body("bio")
  .optional()
  .isString()
  .withMessage("Bio must be a string")
  .isLength({ min: 5, max: 160 })
  .withMessage("Bio must be between 5 and 160 characters long");

export const websiteValidetor: ValidationChain = body("website")
  .optional()
  .isURL()
  .withMessage("Website must be a valid URL")
  .isLength({ max: 100 })
  .withMessage("Website must be at most 100 characters long");
