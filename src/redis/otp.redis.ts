import crypto from "node:crypto";
import redis from "../config/redis.config.js";
import ServiceError from "../helper/servicesError.helper.js";

const OTP_TTL_SECONDS = 600; // 10 minutes
const VERIFIED_FLAG_TTL_SECONDS = 600; // 10 minutes
const MAX_OTP_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60; // 1 minute cooldown

export type OtpContext = "registration" | "forget_password";

function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

export const generateOTP = async (
  userEmail: string,
  context: OtpContext,
): Promise<string> => {
  const otpKey = `otp:${context}:${userEmail}`;
  const attemptsKey = `otp:attempts:${context}:${userEmail}`;
  const cooldownKey = `otp:cooldown:${context}:${userEmail}`;

  const isInCooldown = await redis.get(cooldownKey);
  if (isInCooldown) {
    const ttl = await redis.ttl(cooldownKey);
    throw new ServiceError(
      `Please wait ${ttl} seconds before requesting a new OTP`,
      429,
    );
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  console.log(`Generated OTP for ${userEmail} (${context}): ${otp}`);

  const hashedOTP = hashOtp(otp);

  await redis.setex(otpKey, OTP_TTL_SECONDS, hashedOTP);
  await redis.setex(cooldownKey, RESEND_COOLDOWN_SECONDS, "1");
  await redis.del(attemptsKey);

  return otp;
};

export const verifyOTP = async (
  userEmail: string,
  otp: string,
  context: OtpContext,
): Promise<boolean> => {
  const redisKey = `otp:${context}:${userEmail}`;
  const attemptsKey = `otp:attempts:${context}:${userEmail}`;

  const storedHash = await redis.get(redisKey);
  if (!storedHash) return false;

  const attempts = Number((await redis.get(attemptsKey)) || "0");
  if (attempts >= MAX_OTP_ATTEMPTS) {
    await redis.del(redisKey);
    await redis.del(attemptsKey);
    return false;
  }

  const inputHash = hashOtp(otp);
  const storedBuffer = Buffer.from(storedHash);
  const inputBuffer = Buffer.from(inputHash);

  const isValid =
    storedBuffer.length === inputBuffer.length &&
    crypto.timingSafeEqual(storedBuffer, inputBuffer);

  if (isValid) {
    await redis.del(redisKey);
    await redis.del(attemptsKey);
    await redis.setex(
      `verified_${context}:${userEmail}`,
      VERIFIED_FLAG_TTL_SECONDS,
      "true",
    );
  } else {
    await redis.incr(attemptsKey);
    await redis.expire(attemptsKey, OTP_TTL_SECONDS);
  }

  return isValid;
};

export const isActionVerified = async (
  userEmail: string,
  context: OtpContext,
): Promise<boolean> => {
  const verifiedKey = `verified_${context}:${userEmail}`;

  const isVerified = await redis.get(verifiedKey);

  if (isVerified === "true") {
    await redis.del(verifiedKey);
    return true;
  }

  return false;
};
