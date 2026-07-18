import redis from "../../config/redis.config.js";

export const setUserOnline = async (transferId: string) => {
  await redis.set(`online:${transferId}`, "1", "EX", 300);
};

export const setUserOffline = async (transferId: string) => {
  await redis.del(`online:${transferId}`);
  await redis.set(`last_seen:${transferId}`, Date.now().toString(), "EX", 10800); // 3 hours
};

export const isUserOnline = async (transferId: string): Promise<boolean> => {
  const online = await redis.exists(`online:${transferId}`);
  return !!online;
};

export const setUserLastSeen = async (transferId: string) => {
  await redis.set(`last_seen:${transferId}`, Date.now().toString(), "EX", 10800); // 3 hours
};

export const getUserLastSeen = async (
  transferId: string,
): Promise<number | null> => {
  const lastSeen = await redis.get(`last_seen:${transferId}`);
  return lastSeen ? parseInt(lastSeen) : null;
};