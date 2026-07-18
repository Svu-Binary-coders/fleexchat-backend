import { Worker } from "bullmq";
import { redisBullMQClient } from "../../config/redis.config.js";
import { bullMQConnection } from "../redis.bullmq.js";
import { supabase } from "../../config/supabase.config.js";

export const startLastMessageWorker = () => {
  const worker = new Worker(
    "last-message",
    async (job) => {
      const { chatId } = job.data;
            const cached = await redisBullMQClient.get(`lastMsg:${chatId}`);
      if (!cached) return;

      const messageId = JSON.parse(cached);
      const { error } = await supabase
        .from("chats")
        .update({ last_message_id: messageId })
        .eq("custom_chat_id", chatId); 
      if (error) {
        console.error(`Failed to update last message for chat ${chatId}:`, error.message);
        throw error; 
      }
            await redisBullMQClient.del(`lastMsg:${chatId}`);
    },
    { 
      connection: bullMQConnection,
     
    }
  );

  // Worker Error Handling (Best Practice)
  worker.on("failed", (job, err) => {
    console.error(`BullMQ Job failed (ID: ${job?.id}): ${err.message}`);
  });

  console.log("Last Message Worker started successfully");
};