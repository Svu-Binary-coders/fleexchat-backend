import redis from "../../config/redis.config.js";
export const setUserOnline = async (userId: string) => {
  await redis.set(`online:${userId}`, "1", "EX", 300);
};

export const setUserOffline = async (userId: string) => {
  await redis.del(`online:${userId}`);
  await redis.set(`last_seen:${userId}`, Date.now().toString(), "EX", 10800); //3 hours
};

export const isUserOnline = async (userId: string): Promise<boolean> => {
  const online = await redis.exists(`online:${userId}`);
  return !!online;
};

export const setUserLastSeen = async (userId: string) => {
  await redis.set(`last_seen:${userId}`, Date.now().toString(), "EX", 10800); //3 hours
};

export const getUserLastSeen = async (
  userId: string,
): Promise<number | null> => {
  const lastSeen = await redis.get(`last_seen:${userId}`);
  return lastSeen ? parseInt(lastSeen) : null;
};
