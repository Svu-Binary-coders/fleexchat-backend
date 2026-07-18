import { Worker, type ConnectionOptions } from "bullmq";
import { redisBullMQClient } from "../../config/redis.config.js";
import { deleteMediaService } from "../../services/upload.services.js";

export const fileDeletionWorker = new Worker(
  "file-deletion",
  async (job) => {
    const { provider, publicId, path, mediaType } = job.data;

    await deleteMediaService(publicId, path, provider, mediaType);
  },
  {
    connection: redisBullMQClient as unknown as ConnectionOptions,
    concurrency: 10,
  },
);

fileDeletionWorker.on("completed", (job) => {
  console.log(`File deleted — job ${job.id} | provider: ${job.data.provider}`);
});

fileDeletionWorker.on("failed", (job, err) => {
  console.error(`File deletion failed — job ${job?.id}:`, err.message);
});
