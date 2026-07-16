import { Server, Socket } from "socket.io";
import {
  addRecationOnChat,
  deleteMessage,
  editMessage,
  markAllAsRead,
  markAsDelivered,
  markAsRead,
  saveMessageToDB,
  toggleImportant,
} from "../../services/chat/msssageSave.socket.services.js";
import { saveChatRoom } from "../../services/chat/user.chat.services.js";
import { MessageType } from "../../enums/chat.enums.js";

export const registerChatHandlers = (io: Server, socket: Socket) => {
  // ===============================================
  // ১. Send Message
  // ===============================================
  socket.on("send_message", async (messageData, callback) => {
    try {
      const {
        chatRoomId,
        receiverId,
        content,
        mediaType,
        replyToMessageId,
        is_view_once,
        is_forwarded,
        attachment,
        disappearingDuration,
      } = messageData;

      const cleanSenderId = socket.data.userId; // PostgreSQL UUID

      const hasAttachment =
        attachment && Array.isArray(attachment) && attachment.length > 0;
      const messageType =
        mediaType || hasAttachment ? MessageType.MEDIA : MessageType.TEXT;

      if (!cleanSenderId) {
        if (callback)
          callback({ success: false, message: "Required fields missing!" });
        return;
      }

      const hasContent =
        typeof content === "string" ? content.trim().length > 0 : !!content;

      if (!hasContent && !hasAttachment) {
        if (callback)
          callback({
            success: false,
            message: "Message content or attachment is required!",
          });
        return;
      }

      let activeChatId = chatRoomId;

      // নতুন ১-টু-১ চ্যাট হলে আগে চ্যাট রুম তৈরি করে নেওয়া (PostgreSQL)
      if (!activeChatId && receiverId) {
        const chatRoomInfo = await saveChatRoom(
          cleanSenderId,
          receiverId.trim(),
        );
        activeChatId = chatRoomInfo.chatRoomId; // PostgreSQL UUID
      }

      if (!activeChatId) throw new Error("Chat Room ID is missing");

      let isForwarded = false;
      if (is_forwarded == true || is_forwarded === "true") {
        isForwarded = true;
      }

      const attachmentData = hasAttachment
        ? attachment.map((item: any) => ({
            url: item.url,
            type: item.type,
            mimeType: item.mimeType,
            name: item.name,
            size: item.size,
            duration: item.duration ?? null,
            provider: item.provider,
            path: item.path,
            publicId: item.publicId ?? null,
          }))
        : undefined;

      // MongoDB তে মেসেজ সেভ করা
      const savedMessage = await saveMessageToDB(
        chatRoomId,
        cleanSenderId,
        activeChatId,
        content,
        messageType,
        mediaType ?? undefined,
        attachmentData,
        replyToMessageId,
        is_view_once,
        isForwarded,
        disappearingDuration,
      );

      const lastMessagePayload = {
        chatId: activeChatId,
        lastMessage: {
          content:
            savedMessage.content ||
            (Array.isArray(savedMessage.attachments) &&
            savedMessage.attachments.length > 0
              ? "Attachment"
              : ""),
          createdAt: savedMessage.createdAt,
          messageType: savedMessage.messageType,
        },
      };

      // 🚀 ROOM BROADCASTING (No Manual Loops!)
      // socket.to() ব্যবহার করলে যে মেসেজ পাঠিয়েছে সে ছাড়া ওই রুমের বাকি সবাই মেসেজটি পেয়ে যাবে
      socket.to(activeChatId).emit("receive_private_message", savedMessage);
      socket.to(activeChatId).emit("last_message_update", lastMessagePayload);

      // যে পাঠিয়েছে তার নিজের সাইডবার আপডেটের জন্য (Optional)
      socket.emit("last_message_update", lastMessagePayload);

      // সফল হলে সেন্ডারকে কলব্যাক দেওয়া
      if (callback) callback({ success: true, data: savedMessage });
    } catch (error: any) {
      console.error("Socket Error:", error);
      if (callback) callback({ success: false, message: error.message });
    }
  });

  // ===============================================
  // ২. Read & Deliver Receipts
  // ===============================================
  socket.on("message_read", async ({ chatRoomId, senderId }) => {
    try {
      const readerId = socket.data.userId;
      await markAsRead(chatRoomId, senderId, readerId);
      socket.to(chatRoomId).emit("message_read_ack", { chatRoomId });
    } catch (error) {
      console.error("Read error:", error);
    }
  });

  socket.on("mark_all_read", async ({ chatRoomId, senderId }) => {
    try {
      await markAllAsRead(chatRoomId, senderId);
      socket.to(chatRoomId).emit("mark_all_read_ack", { chatRoomId });
    } catch (error) {
      console.error("Mark all read error:", error);
    }
  });

  // ===============================================
  // ৩. Typing Status
  // ===============================================
  socket.on("typing", ({ chatRoomId }) => {
    socket
      .to(chatRoomId)
      .emit("show_typing", { senderId: socket.data.userId, chatRoomId });
  });

  socket.on("stop_typing", ({ chatRoomId }) => {
    socket.to(chatRoomId).emit("hide_typing", {
      senderId: socket.data.userId,
      chatRoomId: chatRoomId,
    });
  });

  // ===============================================
  // ৪. Edit & Delete Message
  // ===============================================
  socket.on(
    "edit_message", // টাইপো 'edit_messsage' ঠিক করা হলো
    async ({ messageId, newContent, chatRoomId }, callback) => {
      try {
        const isEditMessage = await editMessage(
          chatRoomId,
          messageId,
          newContent,
        );
        if (callback) callback({ success: true, data: isEditMessage });

        if (isEditMessage) {
          socket.to(chatRoomId).emit("message_edited_ack", {
            messageId,
            newContent,
            chatRoomId,
          });
        }
      } catch (error) {
        console.error("Edit message error:", error);
        if (callback)
          callback({ success: false, message: "Failed to edit message" });
      }
    },
  );

  socket.on(
    "delete_message",
    async ({ messageId, chatRoomId, deleteForEveryone }, callback) => {
      try {
        const senderId = socket.data.userId;
        await deleteMessage(chatRoomId, messageId, deleteForEveryone, senderId);

        if (callback) callback({ success: true });

        if (deleteForEveryone) {
          socket.to(chatRoomId).emit("message_deleted_ack", {
            messageId,
            chatRoomId,
            deleteForEveryone,
          });
        }
      } catch (error) {
        console.error("Delete message error:", error);
        if (callback)
          callback({ success: false, message: "Failed to delete message" });
      }
    },
  );

  // ===============================================
  // ৫. Star & Reaction
  // ===============================================
  socket.on("toggle_star", async ({ chatRoomId, messageId }, callback) => {
    try {
      const updatedMessage = await toggleImportant(chatRoomId, messageId);
      socket.to(chatRoomId).emit("message_starred_ack", {
        messageId: updatedMessage._id,
        isImportant: updatedMessage.isImportant,
      });

      if (callback) {
        callback({
          success: true,
          data: { isImportant: updatedMessage.isImportant },
        });
      }
    } catch (error) {
      console.error("Toggle star error:", error);
      if (callback)
        callback({ success: false, message: "Failed to toggle star" });
    }
  });

  socket.on("reaction", async ({ chatId, messageId, reaction }, callback) => {
    try {
      const senderId = socket.data.userId;
      const updatedMessage = await addRecationOnChat(
        chatId,
        messageId,
        senderId,
        reaction,
      );
      socket.to(chatId).emit("reaction_added_ack", {
        messageId: updatedMessage?._id,
        reaction: reaction,
        senderId: senderId,
      });

      if (callback) callback({ success: true });
    } catch (error) {
      if (callback) {
        callback({ success: false, message: "Failed to add reaction" });
      }
    }
  });
};
