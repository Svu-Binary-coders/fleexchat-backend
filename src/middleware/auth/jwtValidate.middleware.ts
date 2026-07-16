import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import {
  getJWTFromRedis,
  setJWTInRedis,
} from "../../helper/jwtCache.helper.js";
import { UserAccountStatus } from "../../enums/auth.enums.js";
import { supabase } from "../../config/supabase.config.js";

const JWT_SECRET = process.env.ACCESS_TOKEN_SECRET_KEY;
if (!JWT_SECRET) {
  throw new Error("JWT secret key is not defined in environment variables");
}

export const deleteCookies = (res: Response) => {
  res.clearCookie("FCAccessToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });
};

export const verifyJWTMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token = req.signedCookies.FCAccessToken;

  if (!token) {
    return res
      .status(401)
      .json({ message: "Authentication required", success: false });
  }

  try {
    const decodedToken = jwt.verify(token, JWT_SECRET) as {
      _id: string;
      customId: string;
      sessionId: string;
    };

    const { _id, sessionId } = decodedToken;

    // Redis cache check
    const cachedUser = await getJWTFromRedis(sessionId);
    if (cachedUser) {
      if (cachedUser.userAccountStatus === UserAccountStatus.SUSPENDED) {
        return res.status(403).json({
          message: "Account is suspended. Contact support.",
          success: false,
        });
      }

      res.locals.user = {
        userId: cachedUser.userId,
        customId: cachedUser.customId,
        userAccountStatus: cachedUser.userAccountStatus,
        sessionId,
      };
      return next();
    }

    // Cache miss — DB hit (parallel)
    const [{ data: user, error: userError }, { data: session }] =
      await Promise.all([
        supabase
          .from("users")
          .select("id, user_id, account_status")
          .eq("id", _id)
          .maybeSingle(),
        supabase
          .from("user_activities")
          .select("id")
          .eq("session_id", sessionId)
          .eq("user_id", _id)
          .eq("status", "active")
          .maybeSingle(),
      ]);

    if (userError || !user) {
      deleteCookies(res);
      return res
        .status(401)
        .json({ message: "User not found", success: false });
    }

    if (user.account_status === UserAccountStatus.SUSPENDED) {
      return res.status(403).json({
        message: "Account is suspended. Contact support.",
        success: false,
      });
    }

    if (!session) {
      deleteCookies(res);
      return res.status(401).json({
        message: "Invalid session. Please log in again.",
        success: false,
      });
    }

    // Redis set
    await setJWTInRedis(sessionId, user.id, user.user_id, user.account_status);

    res.locals.user = {
      userId: user.id,
      customId: user.user_id,
      userAccountStatus: user.account_status,
      sessionId,
    };

    return next();
  } catch (error) {
    deleteCookies(res);
    return res.status(401).json({ message: "Invalid token", success: false });
  }
};
