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
import { getInternalUuid } from "../../redis/getInternalUserUuid.js";

export const registerChatHandlers = (io: Server, socket: Socket) => {
  // ===============================================
  //  Send Message
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

      const cleanSenderId = socket.data.userId;

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

      // [Step 1] Resolving ChatRoom (Using UUID internally)
      let customChatId = chatRoomId;
      if (!customChatId && receiverId) {
        const receiverUUId = await getInternalUuid(receiverId);
        const chatRoomInfo = await saveChatRoom(cleanSenderId, receiverUUId);
        customChatId = chatRoomInfo.customChatId;
      }

      if (!customChatId) throw new Error("Chat Room ID is missing");

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

      // [Step 2] Save to DB (Internal UUIDs only)
      const savedMessage = await saveMessageToDB(
        cleanSenderId,
        customChatId,
        content,
        messageType,
        mediaType ?? undefined,
        attachmentData,
        replyToMessageId,
        is_view_once,
        isForwarded,
        disappearingDuration,
      );
      const senderTransferId = socket.data.transferId;

      const formattedPayload = {
        _id: savedMessage._id,
        chatId: customChatId,
        senderId: senderTransferId,
        content: savedMessage.content,
        messageType: savedMessage.messageType,
        messageStatus: savedMessage.messageStatus,
        createdAt: savedMessage.createdAt,
        updatedAt: savedMessage.updatedAt,
        is_view_once: savedMessage.is_view_once,
        is_forwarded: savedMessage.is_forwarded,
        is_edited: savedMessage.is_edited,
        isDeleted: savedMessage.isDeleted,
        replyTo: savedMessage.replyTo,
        attachments: savedMessage.attachments || [],
      };

      const lastMessagePayload = {
        chatId: customChatId, // Custom ID
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

      socket.to(customChatId).emit("receive_message", formattedPayload);
      socket.to(customChatId).emit("last_message_update", lastMessagePayload);
      socket.emit("last_message_update", lastMessagePayload);

      if (callback) callback({ success: true, data: formattedPayload });
    } catch (error: any) {
      console.error("Socket Error:", error);
      if (callback) callback({ success: false, message: error.message });
    }
  });

  // ===============================================
  //  Read & Deliver Receipts
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
  //  Typing Status
  // ===============================================
  socket.on("typing", (data: { chatRoomId: string }) => {
    const { chatRoomId } = data;
    if (!chatRoomId) return;

    const senderTransferId = socket.data.transferId;

    socket.to(chatRoomId).emit("show_typing", {
      chatRoomId,
      senderId: senderTransferId, // ⬅️ "userId" থেকে "senderId"
    });
  });

  socket.on("stop_typing", (data: { chatRoomId: string }) => {
    const { chatRoomId } = data;
    if (!chatRoomId) return;

    const senderTransferId = socket.data.transferId;

    socket.to(chatRoomId).emit("hide_typing", {
      chatRoomId,
      senderId: senderTransferId,
    });
  });

  // ===============================================
  //  Edit & Delete Message
  // ===============================================
  socket.on(
    "edit_message",
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
  //Star & Reaction
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
