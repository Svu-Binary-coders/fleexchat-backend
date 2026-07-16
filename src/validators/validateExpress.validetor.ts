import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";

export const validateExpress = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }

  return res.status(400).json({
    success: false,
    message: errors.array()[0]?.msg || "Validation error",
  });
};