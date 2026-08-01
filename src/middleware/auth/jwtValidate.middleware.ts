import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import {
  getJWTFromRedis,
  setJWTInRedis,
} from "../../helper/jwtCache.helper.js";
import { UserAccountStatus } from "../../enums/auth.enums.js";
import { supabase } from "../../config/supabase.config.js";
import cookieParser from "cookie-parser";

const COOKIE_SECRET = process.env.COOKIE_SECRET_KEY;
if (!COOKIE_SECRET) {
  throw new Error("Cookie secret is not defined in environment variables");
}

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

/**
 * Used as middleware to verify JWT tokens in Express routes. It checks for the presence of a signed JWT token in the request cookies, verifies it, and retrieves user information from Redis cache or Supabase database. If the token is valid and the user is active, it attaches user information to `res.locals` for downstream middleware or route handlers.
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function to pass control to the next middleware
 * @returns Calls `next()` if authentication is successful, otherwise sends an appropriate HTTP response with an error message.
 * @see https://www.npmjs.com/package/jsonwebtoken
 * @see https://www.npmjs.com/package/express
 * @see https://www.npmjs.com/package/cookie-parser
 * @see https://supabase.com/docs/reference/javascript/supabase-client
 * @see https://redis.io/docs/
 */
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
        userName: cachedUser.userName,
        transferId: cachedUser.transferId,
      };
      return next();
    }

    // Cache miss — DB hit (parallel)
    const [{ data: user, error: userError }, { data: session }] =
      await Promise.all([
        supabase
          .from("users")
          .select("id, user_id, account_status,name,transfer_id")
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
    await setJWTInRedis(
      sessionId,
      user.id,
      user.user_id,
      user.account_status,
      user.name,
      user.transfer_id,
    );

    res.locals.user = {
      userId: user.id,
      customId: user.user_id,
      userAccountStatus: user.account_status,
      sessionId,
      userName: user.name,
      transferId: user.transfer_id,
    };

    return next();
  } catch (error) {
    deleteCookies(res);
    return res.status(401).json({ message: "Invalid token", success: false });
  }
};

export const verifySocketJWT = async (socket: any, next: any) => {
  try {
    const rawCookieHeader = socket.handshake.headers.cookie;

    if (!rawCookieHeader) {
      return next(new Error("Authentication required: No cookies found"));
    }

    const cookies: Record<string, string> = {};
    rawCookieHeader.split(";").forEach((c: string) => {
      const [key, value] = c.trim().split("=");
      if (key && value !== undefined) {
        cookies[key] = decodeURIComponent(value);
      }
    });

    const rawToken = cookies.FCAccessToken;

    if (!rawToken) {
      return next(new Error("Authentication required: Token missing"));
    }

    const unsignedToken = cookieParser.signedCookie(rawToken, COOKIE_SECRET);

    if (!unsignedToken || unsignedToken === rawToken) {
      return next(new Error("Authentication required: Invalid signed cookie"));
    }

    const req = {
      signedCookies: { FCAccessToken: unsignedToken },
    } as any;

    let isAuthFailed = false;
    const res = {
      locals: {},
      status: function () {
        return this;
      },
      json: function (data: any) {
        isAuthFailed = true;
        return next(new Error(data?.message || "Authentication failed"));
      },
      clearCookie: () => {},
    } as any;

    await verifyJWTMiddleware(req, res, (err?: any) => {
      if (isAuthFailed) return;

      if (err) return next(err);

      if (res.locals.user) {
        socket.data.userId = res.locals.user.userId;
        socket.data.customId = res.locals.user.customId;
        socket.data.sessionId = res.locals.user.sessionId;
        socket.data.userName = res.locals.user.userName;
        socket.data.transferId = res.locals.user.transferId;

        return next();
      }

      return next(new Error("Authentication failed: User data missing"));
    });
  } catch (error) {
    console.error("Socket Auth Error:", error);
    return next(new Error("Internal Server Error"));
  }
};
