import { Redis } from "ioredis";

const redisHost = process.env.REDIS_HOST || "127.0.0.1";
const redisPort = process.env.REDIS_PORT
  ? parseInt(process.env.REDIS_PORT)
  : 6379;
const redisPassword = process.env.REDIS_PASSWORD;

const redis = new Redis({
  host: redisHost,
  port: redisPort,
  ...(redisPassword && { password: redisPassword }),
  connectTimeout: 10000,
  maxRetriesPerRequest: null,

  retryStrategy: (times) => {
    if (times > 10) {
      console.error(" Too many Redis connection attempts. Stopping retries.");
      return null;
    }

    const delay = Math.min(times * 100, 3000);
    return delay;
  },
});

export const redisBullMQClient = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  password: process.env.REDIS_PASSWORD,
  retryStrategy(times: number) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: null,
});

redis.on("connect", () => {
  console.log(` Redis Connected Successfully on ${redisHost}:${redisPort}!`);
});

redis.on("error", (err) => {
  console.error(" Redis Connection Error:", err.message);
});

export default redis;
