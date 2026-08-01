import { Types } from "mongoose";
import { supabase } from "../../config/supabase.config.js";
import MessageModel from "../../models/message.model.js";
import { MessageStatus, MessageType } from "../../enums/chat.enums.js";
import { Attachment } from "../../models/attachments.model.js";
import { scheduleLastMessageFlush } from "../../bullMQ/queues/lastMessage.queue.js";
import ServiceError from "../../helper/servicesError.helper.js";
import { getChatSQLId } from "../../redis/chat/getSQLId.redis.js";
import { fileDeletionQueue } from "../../bullMQ/queues/fileDeletionQueqe.js";

// ===============================================
// 1. Save Message to DB (Cross-Database)
// ===============================================
export const saveMessageToDB = async (
  senderId: string,
  customChatId: string,
  content: string,
  messageType: string,
  mediaType?: string,
  attachments?: {
    url: string;
    type: string;
    mimeType: string;
    name: string;
    size: number;
    duration?: number | null;
    provider: string;
    path: string;
    publicId?: string | null;
  }[],
  replyToMessageId?: string,
  is_view_once: boolean = false,
  is_forwarded: boolean = false,
  disappearingDuration?: number,
) => {
  const { data: chatData, error: chatError } = await supabase
    .from("chats")
    .select("id, is_group_chat, chat_participants(user_id)")
    .eq("custom_chat_id", customChatId)
    .maybeSingle();

  if (chatError || !chatData) {
    throw new Error("Chat not found for the provided chatId");
  }

  const postgresChatId = chatData.id;
  const participants = chatData.chat_participants.map((p: any) => p.user_id);
  const hasAttachments = !!(attachments && attachments.length > 0);

  const newMessage = await MessageModel.create({
    chatId: postgresChatId,
    senderId: senderId,
    content,
    is_forwarded,
    is_view_once,
    messageType: messageType as MessageType,
    hasAttachments,
    ...(disappearingDuration && { expiresAt: disappearingDuration }),
    ...(mediaType && { mediaType }),
    ...(replyToMessageId && { replyTo: new Types.ObjectId(replyToMessageId) }),
  });

  let savedAttachments: any[] = [];
  if (hasAttachments && attachments) {
    const attachmentDocs = await Attachment.insertMany(
      attachments.map((item) => ({
        messageId: newMessage._id,
        chatId: postgresChatId,
        uploadedBy: senderId,
        url: item.url,
        type: item.type,
        name: item.name,
        size: item.size,
        mimeType: item.mimeType,
        duration: item.duration ?? null,
        provider: item.provider,
        path: item.path,
        publicId: item.publicId ?? null,
      })),
    );

    savedAttachments = attachmentDocs.map((a) => a.toObject());
    const attachmentIds = attachmentDocs.map((a) => a._id);

    await MessageModel.findByIdAndUpdate(newMessage._id, {
      attachments: attachmentIds,
    });
  }

  let replyToData = null;
  if (replyToMessageId) {
    const replyMsg = await MessageModel.findById(replyToMessageId)
      .select(
        "content senderId messageType hasAttachments is_deleted_for_everyone",
      )
      .lean();

    if (!replyMsg) throw new Error("Reply target message not found");

    const replyAttachments = await Attachment.find({
      messageId: new Types.ObjectId(replyToMessageId),
    })
      .select("url type mimeType name size duration publicId")
      .lean();

    const { data: replySender } = await supabase
      .from("users")
      .select("transfer_id, name, profile_image")
      .eq("id", replyMsg.senderId)
      .single();

    replyToData = {
      ...replyMsg,
      attachments: replyAttachments,
      senderDetails: replySender
        ? {
            _id: replySender.transfer_id,
            userName: replySender.name,
            profilePicture: replySender.profile_image,
          }
        : null,
    };
  }

  await scheduleLastMessageFlush(customChatId, newMessage._id.toString());

  return {
    ...newMessage.toObject(),
    attachments: savedAttachments,
    replyTo: replyToData,
    chatRoomId: customChatId,
    isGroupChat: chatData.is_group_chat,
    participants: participants,
  };
};

// ===============================================
// 2. Mark as Delivered & Read
// ===============================================
export const markAsDelivered = async (chatRoomId: string, senderId: string) => {
  const { data: chat } = await supabase
    .from("chats")
    .select("id")
    .eq("custom_chat_id", chatRoomId)
    .single();
  if (!chat) throw new Error("Chat not found");

  await MessageModel.updateMany(
    {
      chatId: chat.id,
      senderId: senderId,
      messageStatus: MessageStatus.SENT,
    },
    { $set: { messageStatus: MessageStatus.DELIVERED } },
  );
};

export const markAsRead = async (
  chatRoomId: string,
  senderId: string,
  readerId: string,
) => {
  const { data: chat } = await supabase
    .from("chats")
    .select("id")
    .eq("custom_chat_id", chatRoomId)
    .single();
  if (!chat) return;

  await MessageModel.updateMany(
    {
      chatId: chat.id,
      senderId: senderId,
      messageStatus: { $ne: MessageStatus.READ },
      read_by: { $ne: readerId }, // String UUID
    },
    {
      $set: { messageStatus: MessageStatus.READ },
      $addToSet: { read_by: readerId },
    },
  );
};

export const markAllAsRead = async (chatRoomId: string, senderId: string) => {
  const { data: chat } = await supabase
    .from("chats")
    .select("id")
    .eq("custom_chat_id", chatRoomId)
    .single();
  if (!chat) return;

  await MessageModel.updateMany(
    {
      chatId: chat.id,
      senderId: senderId,
      messageStatus: { $ne: MessageStatus.READ },
    },
    {
      $set: { messageStatus: MessageStatus.READ },
    },
  );
};

// ===============================================
// 3. Edit Message
// ===============================================
export const editMessage = async (
  chatRoomId: string,
  messageId: string,
  newContent: string,
) => {
  const chatUUId = await getChatSQLId(chatRoomId);
  if (!chatUUId) return;

  const editedMessage = await MessageModel.findOneAndUpdate(
    {
      _id: new Types.ObjectId(messageId),
      chatId: chatUUId,
    },
    {
      $set: {
        content: newContent,
        edited: true,
        messageStatus: MessageStatus.SENT,
      },
    },
    { new: true },
  );

  if (editedMessage) {
    await scheduleLastMessageFlush(chatRoomId, editedMessage._id.toString());
  } else {
    console.error("Message not found for editing:", messageId);
  }
  return editedMessage;
};

// ===============================================
// 4. Delete Message
// ===============================================
export const deleteMessage = async (
  chatRoomId: string,
  messageId: string,
  deleteForEveryone: boolean,
  senderId: string, // UUID
) => {
  const { data: chat } = await supabase
    .from("chats")
    .select("id, chat_participants(user_id)")
    .eq("custom_chat_id", chatRoomId)
    .single();

  if (!chat) return null;
  const participants = chat.chat_participants.map((p: any) => p.user_id);

  const message = await MessageModel.findOne({
    _id: new Types.ObjectId(messageId),
    chatId: chat.id,
  }).select("chatId senderId hasAttachments attachments");

  if (!message) return null;

  let deletedMessage;

  // Delete for Everyone Logic
  if (deleteForEveryone) {
    if (message.senderId !== senderId) {
      throw new Error("Only the sender can delete messages for everyone");
    }

    if (
      message.hasAttachments &&
      message.attachments &&
      message.attachments.length > 0
    ) {
      const attachments = await Attachment.find({
        _id: { $in: message.attachments },
      }).select("type provider publicId path");
      await Promise.all(
        attachments.map((attachment) =>
          fileDeletionQueue.add("delete-file", {
            fileId: attachment._id.toString(),
            provider: attachment.provider,
            publicId: attachment.publicId,
            path: attachment.path,
            mediaType: attachment.type,
          }),
        ),
      );

      await Attachment.deleteMany({ _id: { $in: message.attachments } });
    }

    deletedMessage = await MessageModel.findOneAndUpdate(
      { _id: new Types.ObjectId(messageId), chatId: chat.id },
      {
        $set: {
          isDeleted: true,
          is_deleted_for_everyone: true,
          delete_by: participants,
          hasAttachments: false,
          attachments: [],
          content: "This message was deleted",
        },
      },
      { new: true },
    );
  } else {
    // Delete for Me Logic
    deletedMessage = await MessageModel.findOneAndUpdate(
      { _id: new Types.ObjectId(messageId), chatId: chat.id },
      {
        $addToSet: { delete_by: senderId }, // String UUID
      },
      { new: true },
    );
  }

  return deletedMessage;
};

// ===============================================
// 5. Star / Important Message
// ===============================================
export const toggleImportant = async (
  chatRoomId: string,
  messageId: string,
) => {
  const { data: chat } = await supabase
    .from("chats")
    .select("id, is_group_chat, chat_participants(user_id)")
    .eq("custom_chat_id", chatRoomId)
    .single();

  if (!chat) throw new Error("Chat not found");

  const message = await MessageModel.findOne({
    _id: new Types.ObjectId(messageId),
    chatId: chat.id,
  });

  if (!message) throw new Error("Message not found");

  message.isImportant = !message.isImportant;
  await message.save();

  // Find other participant for direct messages
  let receiverId = null;
  if (!chat.is_group_chat) {
    receiverId = chat.chat_participants.find(
      (p: any) => p.user_id !== message.senderId,
    )?.user_id;
  }

  return {
    ...message.toObject(),
    reciverId: receiverId,
  };
};

// ===============================================
// 6. Reactions
// ===============================================
export const addRecationOnChat = async (
  chatRoomId: string,
  messageId: Types.ObjectId,
  userId: string,
  reaction: string,
) => {

  const chatUUID = await getChatSQLId(chatRoomId);
  const message = await MessageModel.findOne({
    _id: messageId,
    chatId: chatUUID,
  });


  if (!message) {
    throw new ServiceError("Message not found in the specified chat", 400);
  }

  const existingReactionIndex = message.reactions.findIndex(
    (r: any) => r.userId === userId,
  );

  if (existingReactionIndex > -1) {
    const existingReaction = message.reactions[existingReactionIndex];
    if (existingReaction && existingReaction.reaction === reaction) {
      message.reactions.splice(existingReactionIndex, 1);
    } else if (existingReaction) {
      existingReaction.reaction = reaction;
    }
  } else {
    message.reactions.push({ userId: userId, reaction });
  }
  await message.save();
  return message;
};
