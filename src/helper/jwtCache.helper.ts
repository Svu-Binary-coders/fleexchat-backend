// src/helper/jwtCache.helper.ts
import redis from "../config/redis.config.js";

interface CachedUser {
  userId: string;
  customId: string;
  userAccountStatus: string;
  sessionId: string;
}

const CACHE_TTL_SECONDS = 5 * 60; // 5 minutes

export async function getJWTFromRedis(
  sessionId: string,
): Promise<CachedUser | null> {
  const raw = await redis.get(`session:${sessionId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CachedUser;
  } catch {
    return null;
  }
}

export async function setJWTInRedis(
  sessionId: string,
  userId: string,
  customId: string,
  userAccountStatus: string,
): Promise<void> {
  const payload: CachedUser = { userId, customId, userAccountStatus, sessionId };
  await redis.set(
    `session:${sessionId}`,
    JSON.stringify(payload),
    "EX",
    CACHE_TTL_SECONDS,
  );
}

export async function invalidateJWTCache(sessionId: string): Promise<void> {
  await redis.del(`session:${sessionId}`);
}
