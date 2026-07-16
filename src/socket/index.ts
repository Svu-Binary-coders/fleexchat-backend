import { Server } from "socket.io";
import { Server as HttpServer } from "http";
import { registerChatHandlers } from "../controllers/privetChat.socket.controllers.js";
import {
  isUserOnline,
  setUserOffline,
  setUserOnline,
} from "../redis/presence.redis.js";
import { verifySocketJWT } from "../validators/verifyJWT.validetor.js";
export const initializeSocket = (httpServer: HttpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: ["localhost:3000", "http://localhost:3000"],
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  // JWT validetor 
  io.use(verifySocketJWT);

  io.on("connection", (socket) => {
    socket.on("setup", async (userId: string) => {
      socket.data.userId = userId.trim(); // Store userId in socket data for later use
      socket.join(userId.trim());
      console.log("user Conncted with ID:", userId);
      await setUserOnline(userId.trim());
      io.emit("user_online", { userId });
    });
    // update online status in redis and notify others
    socket.on("check_status", async (userId: string, callback) => {
      const online = await isUserOnline(userId.trim());
      callback({ online });
    });


    socket.on("join_chat", (chatId: string) => {
      if (chatId) {
        socket.join(chatId.trim());
        console.log(`User ${socket.data.userId} joined chat room: ${chatId}`);
      }
    });

    socket.on("leave_chat", (chatId: string) => {
      if (chatId) {
        socket.leave(chatId.trim());
        console.log(`User ${socket.data.userId} left chat room: ${chatId}`);
      }
    });


    // Register chat handlers for this socket connection
    registerChatHandlers(io, socket);

    socket.on("disconnect", async () => {
      const userId = socket.data.userId;
      if (!userId) return;
      await setUserOffline(userId);
      io.emit("user_offline", { userId });
      console.log(`User disconnected: ${socket.id}`);
    });
  });

  return io;
};
