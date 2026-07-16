// queues/lastMessage.queue.ts
import { Queue } from "bullmq";
import { redisBullMQClient } from "../../config/redis.config.js";
import { bullMQConnection } from "../redis.bullmq.js";

export const lastMessageQueue = new Queue("last-message", {
  connection: bullMQConnection,
});

export const scheduleLastMessageFlush = async (
  chatId: string,
  messageId: string,
) => {
  // set in redis with 1 hour expiry
  await redisBullMQClient.set(
    `lastMsg:${chatId}`,
    JSON.stringify(messageId),
    "EX",
    3600,
  );

  // if there is already a job for this chatId, remove it before adding a new one
  await lastMessageQueue.remove(chatId);

  // schedule a job to flush the last message after 5 minutes of inactivity
  const chat = await lastMessageQueue.add(
    "flush",
    { chatId },
    {
      jobId: chatId,
      delay: 2 * 60 * 1000, // 2 minutes delay for testing, can be set to 5 minutes in production
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
};
