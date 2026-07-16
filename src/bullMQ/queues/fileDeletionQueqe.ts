// queue setup
import { Queue, Worker } from "bullmq";
import { redisBullMQClient } from "../../config/redis.config.js";

export const fileDeletionQueue = new Queue("file-deletion", {
  connection: redisBullMQClient as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
});
