import { startLastMessageWorker } from "../bullMQ/workers/lastMessage.worker.js";

const workers = [startLastMessageWorker];

export const startAllWorkers = () => {
  workers.forEach((start) => start());
};
