import getRedisClient from "../config/redis.config.js";
export const isUserIdNew = async (userId: string) => {
  const userExists = await getRedisClient.exists(`user:${userId}`);
  return !userExists;
};

export const addRegsiterService = async (
  name: string,
  email: string,
  password: string,
  userId: string,
) => {};
