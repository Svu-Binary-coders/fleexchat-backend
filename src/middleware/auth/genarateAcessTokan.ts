import jwt, { type SignOptions } from "jsonwebtoken";
import { JWTExpireTime } from "../../enums/auth.enums.js";

const ACCESS_TOKEN_SECRET_KEY = process.env.ACCESS_TOKEN_SECRET_KEY;

if (!ACCESS_TOKEN_SECRET_KEY) {
  throw new Error(
    "ACCESS_TOKEN_SECRET_KEY is not defined in environment variables",
  );
}

/**
 * Generates an access token for the user
 * @param _id - user id
 * @param customId - custom id
 * @param sessionId - session id
 * @param expireIn - expiration time
 * @returns a JWT access token
 * @see https://www.npmjs.com/package/jsonwebtoken
 */
export const generateAccessToken = (
  _id: string,
  customId: string,
  sessionId: string,
  expireIn: JWTExpireTime,
): string => {
  const payload = {
    _id,
    customId,
    sessionId,
  };

  const options: SignOptions = { expiresIn: expireIn };

  return jwt.sign(payload, ACCESS_TOKEN_SECRET_KEY, options);
};
