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
        // ১. Supabase থেকে চ্যাটের আসল UUID বের করা (যদি ফ্রন্টএন্ড custom_chat_id পাঠায়)
        const { data: chat, error } = await supabase
          .from("chats")
          .select("id")
          .eq("custom_chat_id", chatId) // ফ্রন্টএন্ড যদি সরাসরি UUID পাঠায়, তবে .eq("id", chatId) দেবেন
          .single();

        if (error || !chat) {
          console.error("Chat not found for rotation:", chatId);
          return;
        }

        // ২. DB (MongoDB) তে সব sender key deactivate করা (ObjectId কাস্টিং ছাড়া)
        await invalidateSenderKeysService(chat.id, removedUserId);

        // ৩. গ্রুপের বাকি সব মেম্বারকে Rotation-এর সিগন্যাল পাঠানো
        // Socket.io Rooms ব্যবহার করে শুধু ওই গ্রুপের মেম্বারদেরই সিগন্যাল দেওয়া হলো
        io.to(chatId).emit("group:key_rotation_needed", {
          chatId,
          // ফ্রন্টএন্ড এই ইভেন্ট পেয়ে GET /groups/:chatId/members-public-keys কল করবে
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
      // Room-এ সবাইকে জানানো হলো যে নতুন মেম্বার অ্যাড হয়েছে
      io.to(chatId).emit("group:member_joined", {
        chatId,
        newMemberId,
      });
    },
  );
};
