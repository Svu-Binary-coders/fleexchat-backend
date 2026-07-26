import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { saveAttachmentService } from "../../services/chat/user.chat.services.js";
import {
  deleteMediaService,
  getAllAttachmentsForChatService,
} from "../../services/upload.services.js";
import MessageModel from "../../models/message.model.js";
import ServiceError from "../../helper/servicesError.helper.js";
import {
  MessageType,
  AttachmentType,
  StorageProvider,
} from "../../enums/chat.enums.js";
import { getChatSQLId } from "../../redis/chat/getSQLId.redis.js";

export const confirmAttachmentController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { userId, transferId } = res.locals.user;
    const { chatId, attachments, text = "" } = req.body;
    let { messageId } = req.body;

    if (!chatId) {
      throw new ServiceError("chatId is required", 400);
    }

    if (!Array.isArray(attachments) || attachments.length === 0) {
      throw new ServiceError(
        "Attachments array is required and cannot be empty",
        400,
      );
    }

    const chatUUID = await getChatSQLId(chatId as string);
    if (!chatUUID) {
      throw new ServiceError("Invalid chatId provided", 400);
    }

    if (!messageId) {
      const newMessage = await MessageModel.create({
        chatId: chatUUID,
        senderId: userId,
        content: text,
        hasAttachments: true,
        messageType: MessageType.MEDIA,
      });

      messageId = newMessage._id.toString();
    }

    const payloads = attachments.map((att: any) => {
      const validTypes = ["image", "video", "audio", "file", "VoiceMessage"];
      return {
        messageId: new Types.ObjectId(messageId),
        chatId: chatUUID, // String (UUID)
        uploadedBy: userId, // String (UUID)
        url: att.url,
        type: validTypes.includes(att.type)
          ? (att.type as AttachmentType)
          : "file",
        name: att.name,
        size: Number(att.size),
        mimeType: att.mimeType,
        provider: att.provider as StorageProvider,
        publicId: att.publicId ?? undefined,
        path: att.path ?? undefined,
        duration: att.duration ?? undefined,
      };
    });

    const savedAttachments = await Promise.all(
      payloads.map((payload) =>
        saveAttachmentService(payload, chatId as string, transferId),
      ),
    );

    res.status(201).json({
      success: true,
      message: "Attachments saved successfully",
      messageId: messageId,
      attachments: savedAttachments,
    });

    try {
      const io = req.app.get("io");

      if (io) {
        const fullMessageResponse = {
          _id: messageId,
          chatId: chatId,
          senderId: transferId,
          messageType: MessageType.MEDIA,
          content: text,
          hasAttachments: true,
          attachments: savedAttachments,
          messageStatus: "sent",
          createdAt: new Date().toISOString(),
          
        };

        io.to(chatId).emit("receive_message", fullMessageResponse);
        let msgContent = text;
        if (!msgContent && savedAttachments.length > 0) {
          const firstAttachment = savedAttachments[0];
          if (firstAttachment?.type === "video") {
            msgContent = "🎥 Video";
          } else if (firstAttachment?.type === "image") {
            msgContent = "📷 Image";
          } else if (firstAttachment?.type === "VoiceMessage") {
            msgContent = "🎵 Voice Message";
          } else if (firstAttachment?.type === "audio") {
            msgContent = "🎵 Audio";
          } else {
            msgContent = "📎 Attachment";
          }
        }
        io.to(chatId).emit("last_message_update", {
          chatId: chatId,
          lastMessage: {
            content: msgContent,
            createdAt: fullMessageResponse.createdAt,
          },
        });

        console.log(`Socket event broadcasted to room: ${chatId}`);
      }
    } catch (socketError) {
      console.error(
        "Socket broadcast failed, but message was saved:",
        socketError,
      );
    }
  } catch (error) {
    const { attachments } = req.body;
    if (Array.isArray(attachments)) {
      for (const att of attachments) {
        try {
          await deleteMediaService(
            att.publicId ?? null,
            att.path ?? null,
            att.provider as StorageProvider,
            att.type as AttachmentType,
          );
        } catch (cleanupError) {
          console.error(
            "Storage cleanup failed during rollback:",
            cleanupError,
          );
        }
      }
    }
    next(error);
  }
};

// ===============================================
// Get Attachments Controller
// ===============================================
export const getAttachmentsForChatController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { chatId } = req.params;

    if (!chatId) {
      throw new ServiceError("chatId is required", 400);
    }

    const attachment = await getAllAttachmentsForChatService(chatId as string);

    res.status(200).json({
      success: true,
      attachments: attachment,
    });
  } catch (error) {
    next(error);
  }
};
