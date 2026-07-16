import { Request, Response, NextFunction } from "express";
import {
  getAllSessionsService,
  getUserDetailsService,
  getUserIdAvailable,
  logoutAllSessionsService,
  logoutService,
  logoutSpecificSessionService,
} from "../services/auth.services.js";
import { getDeviceInfo } from "../helper/getLocation.helper.js";
import { addRegisterService, loginService } from "../services/auth.services.js";
import { JWTExpireTime } from "../enums/auth.enums.js";
import { generateAccessToken } from "../middleware/auth/genarateAcessTokan.js";
import { getCookieOptions } from "../config/cookies.config.js";

export const isUserIdAvailable = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const userId = req.query.userId as string;
  try {
    const isAvailable = await getUserIdAvailable(userId);
    if (!isAvailable) {
      return res.status(409).json({
        success: false,
        message: "This user ID is already taken",
      });
    }
    return res.status(200).json({
      success: true,
      message: "This user ID is available",
    });
  } catch (err) {
    next(err);
  }
};

export const registerUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { name, email, password, userId, fingerprintId, rememberMe } = req.body;
  try {
    const rawip =
      req.headers["x-forwarded-for"] || req.socket.remoteAddress || null;
    const ip = Array.isArray(rawip) ? rawip[0] : rawip;
    const deviceInfo = getDeviceInfo(req.headers["user-agent"] || "");
    const result = await addRegisterService(
      name,
      email,
      password,
      userId,
      fingerprintId,
      ip!,
      {
        os: deviceInfo.os,
        DeviceType: deviceInfo.DeviceType,
        browser: deviceInfo.browser,
        deviceVendor: deviceInfo.deviceVendor,
      },
    );
    let cookieExpireTime = JWTExpireTime.default;
    if (rememberMe) {
      cookieExpireTime = JWTExpireTime.remenberMe;
    }
    const token = await generateAccessToken(
      result.id,
      result.userId,
      result.sessionId,
      cookieExpireTime,
    );

    res.cookie(
      "FCAccessToken",
      token,
      getCookieOptions(
        cookieExpireTime === JWTExpireTime.default
          ? 3 * 60 * 60 * 1000
          : 30 * 24 * 60 * 60 * 1000,
      ),
    );

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const loginUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { email, password, fingerprintId, rememberMe } = req.body;
  try {
    const rawip =
      req.headers["x-forwarded-for"] || req.socket.remoteAddress || null;
    const ip = Array.isArray(rawip) ? rawip[0] : rawip;

    const deviceInfo = getDeviceInfo(req.headers["user-agent"] || "");
    const cookieExpireTime = rememberMe
      ? JWTExpireTime.remenberMe
      : JWTExpireTime.default;

    const loginUser = await loginService(email, password, fingerprintId, ip!, {
      os: deviceInfo.os,
      DeviceType: deviceInfo.DeviceType,
      browser: deviceInfo.browser,
      deviceVendor: deviceInfo.deviceVendor,
    });
    const token = await generateAccessToken(
      loginUser.id,
      loginUser.userId,
      loginUser.sessionId,
      cookieExpireTime,
    );
    res.cookie(
      "FCAccessToken",
      token,
      getCookieOptions(
        cookieExpireTime === JWTExpireTime.default
          ? 3 * 60 * 60 * 1000
          : 30 * 24 * 60 * 60 * 1000,
      ),
    );
    return res.status(200).json({
      success: true,
      message: "User logged in successfully",
      data: loginUser,
    });
  } catch (err) {
    next(err);
  }
};

export const getUserDetails = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const id = res.locals.user?.userId as string;
  try {
    const user = await getUserDetailsService(id);
    return res.status(200).json({
      success: true,
      message: "User details fetched successfully",
      data: user,
    });
  } catch (err) {
    next(err);
  }
};

export const logoutUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const id = res.locals.user?.userId as string;
  const sessionId = res.locals.user?.sessionId as string;
  try {
    await logoutService(id, sessionId);
    return res.status(200).json({
      success: true,
      message: "User logged out successfully",
    });
  } catch (err) {
    next(err);
  }
};

export const getAllSessionsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const id = res.locals.user?.userId as string;
  const currentSessionId = res.locals.user?.sessionId as string;
  try {
    const sessions = await getAllSessionsService(id, currentSessionId);
    return res.status(200).json({
      success: true,
      message: "Sessions fetched successfully",
      data: sessions,
    });
  } catch (err) {
    next(err);
  }
};

export const logoutAllSessionsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const id = res.locals.user?.userId as string;
  const currentSessionId = res.locals.user?.sessionId as string;
  try {
    await logoutAllSessionsService(id, currentSessionId);
    return res.status(200).json({
      success: true,
      message: "All sessions logged out successfully",
    });
  } catch (err) {
    next(err);
  }
};

export const logoutSpecificSessionController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const id = res.locals.user?.userId as string;
  const currentSessionId = res.locals.user?.sessionId as string;
  const { sessionId } = req.params as { sessionId: string };
  if (sessionId === currentSessionId) {
    return res.status(400).json({
      success: false,
      message: "You cannot log out from the current session",
    });
  }
  try {
    await logoutSpecificSessionService(id, sessionId);
    return res.status(200).json({
      success: true,
      message: "Specific session logged out successfully",
    });
  } catch (err) {
    next(err);
  }
};
