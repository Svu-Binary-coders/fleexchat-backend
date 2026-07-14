import mongoose from "mongoose";
import { Request, Response, NextFunction } from "express";
import ServiceError from "../helper/servicesError.helper.js";
// Supabase error codes
const SUPABASE_ERROR_CODES: Record<
  string,
  { status: number; message: string }
> = {
  "23505": { status: 409, message: "Duplicate value entered for unique field" },
  "23503": { status: 404, message: "Referenced record not found" },
  "23502": { status: 400, message: "Required field is missing" },
  PGRST116: { status: 404, message: "No data found" },
  PGRST301: { status: 401, message: "Unauthorized" },
};

const globalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  console.log("Error caught by global error handler:", err);

  //  Custom Service Error
  if (err instanceof ServiceError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  //  Supabase / PostgreSQL Error
  if (err?.code) {
    const code = String(err.code);
    const supabaseErr = SUPABASE_ERROR_CODES[code];
    if (supabaseErr) {
      const { status, message } = supabaseErr;
      return res.status(status).json({
        success: false,
        message,
      });
    }
  }

  //  Mongoose Validation Error
  if (err instanceof mongoose.Error.ValidationError) {
    const messages = Object.values(err.errors).map((val: any) => val.message);
    return res.status(400).json({
      success: false,
      message: messages[0] || "Database Validation Error",
    });
  }

  //  MongoDB Cast Error
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({
      success: false,
      message: `Invalid ${err.path}: ${err.value}`,
    });
  }

  //  MongoDB Duplicate Key
  if (err.code && err.code === 11000) {
    const field = err.keyValue ? Object.keys(err.keyValue)[0] : "field";
    return res.status(409).json({
      success: false,
      message: `Duplicate value entered for '${field}' field.`,
    });
  }

  console.error(`[CRITICAL ERROR] Time: ${new Date().toISOString()}`);
  console.error(`URL: ${req.originalUrl}`);
  console.error(`Details: ${err.stack || err.message}`);

  return res.status(500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
};

export default globalErrorHandler;
