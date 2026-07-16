export const bullMQConnection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  retryStrategy(times: number) {
    if (times > 3) return null;
    return Math.min(times * 200, 1000);
  },
  removeOnComplete: true, // when job is complete, remove it from the queue
  removeOnFail: { age: 24 * 3600 }, // after 24 hours, remove failed jobs
};
