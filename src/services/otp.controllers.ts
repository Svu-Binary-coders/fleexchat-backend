import { Request, Response, NextFunction } from "express";
import { generateOTP, verifyOTP } from "../redis/otp.redis.js";

export const sendRegisterOTP = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { email } = req.body;
  try {
    const otp = await generateOTP(email, "registration");
    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (err) {
    next(err);
  }
};

export const verifyRegisterOTP = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { email, otp } = req.body;
  try {
    const isValid = await verifyOTP(email, otp, "registration");

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
    });
  } catch (err) {
    next(err);
  }
};

export const sendForgetPasswordOTP = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { email } = req.body;
  try {
    const otp = await generateOTP(email, "forget_password");
    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const verifyForgetPasswordOTP = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { email, otp } = req.body;
  try {
    const isValid = await verifyOTP(email, otp, "forget_password");
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }
    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
    });
  } catch (error) {
    next(error);
  }
};
