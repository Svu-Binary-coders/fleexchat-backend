import { Server, Socket } from "socket.io";
import { supabase } from "../config/supabase.config.js";
import { invalidateSenderKeysService } from "../services/chat/group/groupSenderKey.servics.js";

export const registerGroupSocketEvents = (socket: Socket, io: Server) => {
  // ============================================
  // ১. Member Leave/Remove - Key Rotation Trigger
  // ============================================
  socket.on(
    "group:trigger_rotation",
    async ({
      chatId,
      removedUserId,
    }: {
      chatId: string;
      removedUserId: string;
    }) => {
      try {
        
        const { data: chat, error } = await supabase
          .from("chats")
          .select("id")
          .eq("custom_chat_id", chatId) 
          .single();

        if (error || !chat) {
          console.error("Chat not found for rotation:", chatId);
          return;
        }

        await invalidateSenderKeysService(chat.id, removedUserId);
        io.to(chatId).emit("group:key_rotation_needed", {
          chatId,
        });

        console.log(`Key rotation triggered for chat: ${chatId}`);
      } catch (err) {
        console.error("Group rotation trigger failed:", err);
      }
    },
  );

  // ============================================
  // ২. New Member Join - Notify Others
  // ============================================
  socket.on(
    "group:member_added",
    async ({
      chatId,
      newMemberId,
    }: {
      chatId: string;
      newMemberId: string;
    }) => {
      io.to(chatId).emit("group:member_joined", {
        chatId,
        newMemberId,
      });
    },
  );
};
