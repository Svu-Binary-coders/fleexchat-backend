import { Server } from "socket.io";
import { Server as HttpServer } from "http";
import {
  isUserOnline,
  setUserOffline,
  setUserOnline,
} from "../redis/chat/presence.redis.js";
import { verifySocketJWT } from "./../middleware/auth/jwtValidate.middleware.js";
import { registerChatHandlers } from "../controllers/socket/privetChat.socket.controllers.js";
import { supabase } from "../config/supabase.config.js";

const HEARTBEAT_INTERVAL_MS = 4 * 60 * 1000;

export const initializeSocket = (httpServer: HttpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: ["http://localhost:3000"],
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });
  io.use(verifySocketJWT);

  io.on("connection", async (socket) => {
    const userId = socket.data.userId; 
    const transferId = socket.data.transferId;

    if (!userId || !transferId) {
      console.log("Disconnecting socket: Missing userId or transferId in JWT");
      socket.disconnect();
      return;
    }

    console.log(`User Connected with ID: ${userId} (Socket: ${socket.id})`);

    socket.join(userId);

    try {
      const { data: participations, error } = await supabase
        .from("chat_participants")
        .select(`chats ( custom_chat_id )`)
        .eq("user_id", userId);

      if (!error && participations) {
        participations.forEach((p: any) => {
          if (p.chats?.custom_chat_id) {
            socket.join(p.chats.custom_chat_id);
          }
        });
        console.log(
          `User ${userId} automatically joined ${participations.length} rooms`,
        );
      }
    } catch (dbError) {
      console.error("Failed to fetch chat rooms for auto-join:", dbError);
    }
    await setUserOnline(transferId);
    io.emit("user_online", { userId: transferId });
    const heartbeatInterval = setInterval(() => {
      setUserOnline(transferId).catch((err) =>
        console.error("Heartbeat setUserOnline failed:", err),
      );
    }, HEARTBEAT_INTERVAL_MS);

    socket.on("check_status", async (checkTransferId: string, callback) => {
      if (!checkTransferId) return;
      const online = await isUserOnline(checkTransferId.trim());
      if (callback) callback({ online });
    });

    socket.on("join_chat", (chatId: string) => {
      if (chatId) {
        socket.join(chatId.trim());
        console.log(`User ${userId} explicitly joined chat room: ${chatId}`);
      }
    });

    socket.on("leave_chat", (chatId: string) => {
      if (chatId) {
        socket.leave(chatId.trim());
        console.log(`User ${userId} left chat room: ${chatId}`);
      }
    });

    // Register Chat Handlers
    registerChatHandlers(io, socket);

    socket.on("disconnect", async () => {
      clearInterval(heartbeatInterval);
      await setUserOffline(transferId);
      io.emit("user_offline", { userId: transferId });
      console.log(`User disconnected: ${socket.id}`);
    });
  });

  return io;
};