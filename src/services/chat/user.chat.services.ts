import * as cheerio from "cheerio";
import bcrypt from "bcrypt";
import { Types } from "mongoose";
import { supabase } from "../../config/supabase.config.js";
import ServiceError from "../../helper/servicesError.helper.js";
import MessageModel from "../../models/message.model.js";
import redis from "../../config/redis.config.js";
import { ILinkPreview } from "../../interface/chat.interface.js";
import { Attachment } from "../../models/attachments.model.js";
import { AttachmentType } from "../../enums/chat.enums.js";
import { generateCustomId } from "../../helper/genarateSortId.helper.js";

// ================================================================
// Search users — Supabase
// ================================================================
export const searchUserName = async (q: string, currentUserId: string) => {
  const { data, error } = await supabase
    .from("users")
    .select("user_id, email, name, profile_image, is_online, last_seen, bio")
    .or(`user_id.ilike.${q}%,email.ilike.${q}%,name.ilike.${q}%`)
    .neq("id", currentUserId)
    .limit(10);
  if (error)
    throw new ServiceError(`Error searching users: ${error.message}`, 500);
  return data;
};

// ================================================================
// Create / get existing 1-1 chat room — Supabase (chats + chat_participants)
// ================================================================
export const saveChatRoom = async (senderId: string, receiverId: string) => {
  if (senderId === receiverId) {
    throw new ServiceError("Sender and Receiver cannot be the same", 400);
  }
  const { data: existingChat, error: existingError } = await supabase.rpc(
    "find_direct_chat_between",
    { p_user_a: senderId, p_user_b: receiverId },
  );
  if (existingError)
    throw new ServiceError("Error checking existing chat", 500);

  if (existingChat && existingChat.length > 0) {
    return {
      chatRoomId: existingChat[0].id,
      customChatId: existingChat[0].custom_chat_id,
    };
  }

  const { data: blockedChat } = await supabase
    .from("chats")
    .select("id")
    .eq("friend_request_status", "blocked")
    .or(`blocked_by.eq.${senderId},blocked_by.eq.${receiverId}`)
    .maybeSingle();

  if (blockedChat) {
    throw new ServiceError(
      "Message cannot be sent. One of the users has blocked the other.",
      403,
    );
  }

  const customChatId = crypto.randomUUID();
  const { data: newChat, error: createError } = await supabase
    .from("chats")
    .insert({
      custom_chat_id: customChatId,
      is_group_chat: false,
      created_by: senderId,
    })
    .select("id, custom_chat_id")
    .single();

  if (createError || !newChat)
    throw new ServiceError("Failed to create chat room", 500);

  await supabase.from("chat_participants").insert([
    { chat_id: newChat.id, user_id: senderId },
    { chat_id: newChat.id, user_id: receiverId },
  ]);

  return { chatRoomId: newChat.id, customChatId: newChat.custom_chat_id };
};

// ================================================================
// helper
// ================================================================
const getDeletedContent = (
  isGroup: boolean,
  deletedByAdmin?: boolean,
): string => {
  if (isGroup && deletedByAdmin) return "This message was deleted by admin";
  return "This message was deleted";
};

// batch-fetch minimal user info from Supabase for a list of user ids (Mongo can't $lookup Postgres)
async function getUsersByIds(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, any>();

  const { data, error } = await supabase
    .from("users")
    .select("id, name, profile_image, transfer_id")
    .in("id", userIds);

  if (error)
    throw new ServiceError(`Error fetching users: ${error.message}`, 500);

  const map = new Map<string, any>();
  (data ?? []).forEach((u) => map.set(u.id, u));
  return map;
}

// ================================================================
// Load chat messages — participant/block check via Supabase, messages via MongoDB
// ================================================================
export const loadAllChatMessages = async (
  senderId: string,
  roomId: string,
  isGroup: boolean,
  limit: number,
  cursor?: string,
) => {
  const { data: chatRoom, error: chatError } = await supabase
    .from("chats")
    .select("id, custom_chat_id, friend_request_status")
    .eq("id", roomId)
    .maybeSingle();
  if (chatError) throw new ServiceError("Error fetching chat room", 500);
  if (!chatRoom) throw new ServiceError("Chat room not found", 404);

  if (!isGroup && chatRoom.friend_request_status === "blocked") {
    throw new ServiceError("You are blocked", 403);
  }

  const { data: participant, error: pError } = await supabase
    .from("chat_participants")
    .select("user_id")
    .eq("chat_id", chatRoom.id)
    .eq("user_id", senderId)
    .maybeSingle();

  if (pError) throw new ServiceError("Error checking participant", 500);
  if (!participant) throw new ServiceError("Not a participant", 403);

  const chatIdStr = chatRoom.id;

  // Mark as read (first page only)
  if (!cursor) {
    await MessageModel.updateMany(
      {
        chatId: chatIdStr,
        senderId: { $ne: senderId },
        read_by: { $nin: [senderId] },
      },
      {
        $addToSet: { read_by: senderId },
        ...(!isGroup && { $set: { messageStatus: "read" } }),
      },
    );
  }

  const rawMessages = await MessageModel.aggregate([
    {
      $match: {
        chatId: chatIdStr,
        isDeleted: false,
        delete_by: { $nin: [senderId] },
        ...(cursor && { _id: { $lt: new Types.ObjectId(cursor) } }),
      },
    },
    { $sort: { _id: -1 } },
    { $limit: limit + 1 },
    {
      $lookup: {
        from: "messages",
        localField: "replyTo",
        foreignField: "_id",
        pipeline: [
          {
            $project: {
              content: 1,
              senderId: 1,
              messageType: 1,
              is_deleted_for_everyone: 1,
              deletedByAdmin: 1,
              hasAttachments: 1,
            },
          },
          {
            $lookup: {
              from: "attachments",
              localField: "_id",
              foreignField: "messageId",
              pipeline: [
                {
                  $project: {
                    _id: 1,
                    url: 1,
                    type: 1,
                    mimeType: 1,
                    name: 1,
                    size: 1,
                    duration: 1,
                    publicId: 1,
                  },
                },
              ],
              as: "attachments",
            },
          },
        ],
        as: "replyToData",
      },
    },
    { $addFields: { replyTo: { $arrayElemAt: ["$replyToData", 0] } } },
    {
      $lookup: {
        from: "attachments",
        localField: "_id",
        foreignField: "messageId",
        pipeline: [{ $project: { __v: 0 } }],
        as: "attachments",
      },
    },
    { $project: { senderData: 0, replyToData: 0, delete_by: 0, __v: 0 } },
  ]);

  if (rawMessages.length === 0) {
    return {
      messages: [],
      pagination: { hasMore: false, nextCursor: null },
      chatInfo: { id: chatRoom.custom_chat_id },
    };
  }

  const senderIdSet = new Set<string>();
  rawMessages.forEach((m: any) => {
    if (m.senderId) senderIdSet.add(m.senderId);
    if (m.replyTo?.senderId) senderIdSet.add(m.replyTo.senderId);
    if (Array.isArray(m.reactions)) {
      m.reactions.forEach((r: any) => {
        if (r.userId) senderIdSet.add(r.userId);
      });
    }
    if (Array.isArray(m.attachments)) {
      m.attachments.forEach((att: any) => {
        if (att.uploadedBy) senderIdSet.add(att.uploadedBy);
      });
    }
    if (Array.isArray(m.replyTo?.attachments)) {
      m.replyTo.attachments.forEach((att: any) => {
        if (att.uploadedBy) senderIdSet.add(att.uploadedBy);
      });
    }
  });
  const usersMap = await getUsersByIds([...senderIdSet]);

  const formattedMessages = rawMessages.map((msg: any) => {
    const senderInfo = msg.senderId ? usersMap.get(msg.senderId) : null;

    msg.chatId = chatRoom.custom_chat_id;
    msg.senderId = senderInfo?.transfer_id || null;

    msg.senderDetails = senderInfo
      ? {
          id: senderInfo.transfer_id,
          userName: senderInfo.name,
          profilePicture: senderInfo.profile_image,
        }
      : null;

    if (Array.isArray(msg.reactions) && msg.reactions.length > 0) {
      msg.reactions = msg.reactions.map((r: any) => {
        const reactorInfo = usersMap.get(r.userId);
        return {
          ...r,
          userId: reactorInfo?.transfer_id || null,
        };
      });
    }

    if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
      msg.attachments = msg.attachments.map((att: any) => {
        const uploaderInfo = att.uploadedBy
          ? usersMap.get(att.uploadedBy)
          : null;
        return {
          ...att,
          chatId: chatRoom.custom_chat_id,
          uploadedBy: uploaderInfo?.transfer_id || null,
        };
      });
    }

    if (msg.replyTo) {
      const replySender = msg.replyTo.senderId
        ? usersMap.get(msg.replyTo.senderId)
        : null;
      msg.replyTo.senderId = replySender?.transfer_id || null;

      msg.replyTo.senderDetails = replySender
        ? {
            id: replySender.transfer_id,
            userName: replySender.name,
            profilePicture: replySender.profile_image,
          }
        : null;

      if (
        Array.isArray(msg.replyTo.attachments) &&
        msg.replyTo.attachments.length > 0
      ) {
        msg.replyTo.attachments = msg.replyTo.attachments.map((att: any) => {
          const uploaderInfo = att.uploadedBy
            ? usersMap.get(att.uploadedBy)
            : null;
          return {
            ...att,
            chatId: chatRoom.custom_chat_id,
            uploadedBy: uploaderInfo?.transfer_id || null,
          };
        });
      }
    }

    if (msg.is_deleted_for_everyone) {
      msg.content = getDeletedContent(isGroup, msg.deletedByAdmin);
      msg.attachments = [];
      msg.senderId = null;
      msg.senderDetails = null;
      msg.reactions = [];
    }

    if (msg.replyTo?.is_deleted_for_everyone) {
      msg.replyTo.content = getDeletedContent(
        isGroup,
        msg.replyTo.deletedByAdmin,
      );
      msg.replyTo.senderId = null;
      msg.replyTo.senderDetails = null;
    }

    if (isGroup) {
      msg.readCount = msg.read_by?.length ?? 0;
    }
    delete msg.read_by;

    return msg;
  });

  const hasMore = formattedMessages.length > limit;
  if (hasMore) formattedMessages.pop();

  const reversed = formattedMessages.reverse();
  const nextCursor = hasMore ? (reversed[0]?._id?.toString() ?? null) : null;

  return {
    messages: reversed,
    pagination: { hasMore, nextCursor },
    chatInfo: { id: chatRoom.custom_chat_id },
  };
};

// ================================================================
// Load contact list — chat/participant meta from Supabase,
// last message + unread count from MongoDB, online status from Redis
// ================================================================
export const loadAllContacts = async (userId: string) => {
  const { data: myParticipations, error: partError } = await supabase
    .from("chat_participants")
    .select(
      "chat_id, is_pinned, is_favorite, is_locked, chats!inner(id, custom_chat_id, is_group_chat, group_name, group_avatar_url, updated_at)",
    )
    .eq("user_id", userId);

  if (partError) throw new ServiceError("Error fetching chat list", 500);
  if (!myParticipations || myParticipations.length === 0) return [];

  const chatIds = myParticipations.map((p: any) => p.chat_id);
  const groupChatIds = myParticipations
    .filter((p: any) => p.chats.is_group_chat)
    .map((p: any) => p.chat_id);
  const directChatIds = myParticipations
    .filter((p: any) => !p.chats.is_group_chat)
    .map((p: any) => p.chat_id);

  // 2) other participant for direct chats
  const otherByChat = new Map<string, string>();
  if (directChatIds.length > 0) {
    const { data: otherRows } = await supabase
      .from("chat_participants")
      .select("chat_id, user_id")
      .in("chat_id", directChatIds)
      .neq("user_id", userId);

    (otherRows ?? []).forEach((r: any) =>
      otherByChat.set(r.chat_id, r.user_id),
    );
  }

  const otherUserIds = [...otherByChat.values()];
  const otherUsersMap = new Map<string, any>();
  if (otherUserIds.length > 0) {
    const { data: otherUsers } = await supabase
      .from("users")
      .select(
        "id, transfer_id, name, profile_image, user_id, backup_keys(public_key_64)",
      )
      .in("id", otherUserIds);

    (otherUsers ?? []).forEach((u: any) => otherUsersMap.set(u.id, u));
  }

  const groupMembersByChat = new Map<string, any[]>();
  if (groupChatIds.length > 0) {
    const { data: groupMembers } = await supabase
      .from("chat_participants")
      .select(
        "id, chat_id, users(id, transfer_id, name, profile_image, user_id)",
      )
      .in("chat_id", groupChatIds);

    (groupMembers ?? []).forEach((m: any) => {
      const list = groupMembersByChat.get(m.chat_id) ?? [];
      list.push({
        id: m.users.transfer_id,
        name: m.users.name,
        avatar: m.users.profile_image,
        customId: m.users.user_id,
      });
      groupMembersByChat.set(m.chat_id, list);
    });
  }

  const lastMessages = await MessageModel.aggregate([
    { $match: { chatId: { $in: chatIds }, isDeleted: false } },
    { $sort: { chatId: 1, createdAt: -1 } },
    { $group: { _id: "$chatId", doc: { $first: "$$ROOT" } } },
    {
      $project: {
        _id: "$doc._id",
        chatId: "$doc.chatId",
        content: "$doc.content",
        createdAt: "$doc.createdAt",
        is_deleted_for_everyone: "$doc.is_deleted_for_everyone",
        deletedByAdmin: "$doc.deletedByAdmin",
      },
    },
  ]);
  const lastMessageByChat = new Map<string, any>();
  lastMessages.forEach((m: any) => lastMessageByChat.set(m.chatId, m));

  const unreadCounts = await MessageModel.aggregate([
    {
      $match: {
        chatId: { $in: chatIds },
        senderId: { $ne: userId },
        read_by: { $nin: [userId] },
        is_deleted_for_everyone: false,
        delete_by: { $nin: [userId] },
      },
    },
    { $group: { _id: "$chatId", count: { $sum: 1 } } },
  ]);
  const unreadByChat = new Map<string, number>();
  unreadCounts.forEach((u: any) => unreadByChat.set(u._id, u.count));

  const pipeline = redis.pipeline();
  directChatIds.forEach((chatId: string) => {
    const otherId = otherByChat.get(chatId) ?? "__dummy__";
    pipeline.exists(`user_online:${otherId}`);
  });
  const onlineResults = directChatIds.length > 0 ? await pipeline.exec() : [];
  const onlineByChat = new Map<string, boolean>();
  directChatIds.forEach((chatId: string, i: number) => {
    onlineByChat.set(chatId, (onlineResults?.[i]?.[1] as number) === 1);
  });

  // 8) merge
  const mapped = myParticipations.map((p: any) => {
    const chat = p.chats;
    let lastMessage = lastMessageByChat.get(p.chat_id) ?? null;
    if (lastMessage?.is_deleted_for_everyone) {
      lastMessage = {
        ...lastMessage,
        content: getDeletedContent(
          chat.is_group_chat,
          lastMessage.deletedByAdmin,
        ),
      };
    }
    const unreadCount = unreadByChat.get(p.chat_id) ?? 0;

    if (chat.is_group_chat) {
      return {
        id: chat.id,
        name: chat.group_name,
        profile_image: chat.group_avatar_url || null,
        customChatId: chat.custom_chat_id,
        isGroupChat: true,
        participants: groupMembersByChat.get(p.chat_id) ?? [],
        lastMessage,
        unreadCount,
        isOnline: null,
        isPinned: p.is_pinned,
        isFavorite: p.is_favorite,
        isChatLock: p.is_locked,
        publicKey: null,
      };
    }

    const otherId = otherByChat.get(p.chat_id);
    const other = otherId ? otherUsersMap.get(otherId) : null;
    if (!other) return null;

    return {
      id: other.transfer_id,
      name: other.name,
      profile_image: other.profile_image,
      customId: other.user_id,
      customChatId: chat.custom_chat_id,
      isGroupChat: false,
      lastMessage,
      unreadCount,
      isOnline: onlineByChat.get(p.chat_id) ?? false,
      isPinned: p.is_pinned,
      isFavorite: p.is_favorite,
      isChatLock: p.is_locked,
      publicKey: other.backup_keys?.public_key_64 ?? null,
    };
  });

  return mapped.filter(Boolean).sort((a: any, b: any) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    const aDate = a.lastMessage?.createdAt ?? 0;
    const bDate = b.lastMessage?.createdAt ?? 0;
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  });
};

// ================================================================
// Create new 1-1 chat room — Supabase
// ================================================================
export const createNewChatRoomServices = async (
  senderId: string,
  receiverId: string,
) => {
  if (senderId === receiverId) {
    throw new ServiceError("Sender and Receiver cannot be the same", 400);
  }

  const { data: users, error } = await supabase
    .from("users")
    .select("id, account_status")
    .in("id", [senderId, receiverId]);

  if (error) throw new ServiceError("Error checking users", 500);

  const receiver = users?.find((u: any) => u.id === receiverId);
  const sender = users?.find((u: any) => u.id === senderId);

  if (!receiver) throw new ServiceError("Receiver not found", 404);

  if (
    sender?.account_status === "suspended" ||
    receiver.account_status === "suspended"
  ) {
    throw new ServiceError(
      "Message cannot be sent. One of the users has blocked the other.",
      403,
    );
  }

  const { data: existingChat } = await supabase.rpc(
    "find_direct_chat_between",
    {
      p_user_a: senderId,
      p_user_b: receiverId,
    },
  );

  if (existingChat && existingChat.length > 0) {
    return { chatRoomId: existingChat[0].custom_chat_id };
  }

  const customChatId = generateCustomId(15);
  const { data: newChat, error: createError } = await supabase
    .from("chats")
    .insert({
      custom_chat_id: customChatId,
      is_group_chat: false,
      created_by: senderId,
    })
    .select("id, custom_chat_id")
    .single();

  if (createError || !newChat)
    throw new ServiceError("Failed to create chat room", 500);

  await supabase.from("chat_participants").insert([
    { chat_id: newChat.id, user_id: senderId },
    { chat_id: newChat.id, user_id: receiverId },
  ]);

  return { isExisting: false, chatRoomId: newChat.custom_chat_id };
};

// ================================================================
// Link preview — unchanged, no DB
// ================================================================
export const getLinkPreviewService = async (
  url: string,
): Promise<ILinkPreview | null> => {
  try {
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
      const ytRes = await fetch(oembedUrl);
      if (ytRes.ok) {
        const ytData = (await ytRes.json()) as {
          title: string;
          author_name: string;
          thumbnail_url: string;
        };
        return {
          url,
          title: ytData.title,
          description: `By ${ytData.author_name}`,
          image: ytData.thumbnail_url,
          siteName: "YouTube",
        };
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "WhatsApp/2.21.12.21 A",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    clearTimeout(timeoutId);
    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    const getMeta = (property: string) =>
      $(`meta[property="${property}"]`).attr("content") ||
      $(`meta[name="${property}"]`).attr("content") ||
      null;

    return {
      url,
      title: getMeta("og:title") || $("title").text() || null,
      description: getMeta("og:description") || getMeta("description") || null,
      image: getMeta("og:image") || null,
      siteName: getMeta("og:site_name") || new URL(url).hostname,
    };
  } catch {
    console.error(`Link preview failed for ${url}`);
    return null;
  }
};

// ================================================================
// Pin / Favorite — Supabase (chat_participants columns)
// ================================================================
export const togglePinChatService = async (
  userId: string,
  customChatId: string,
) => {
  const { data: chatRoom, error } = await supabase
    .from("chats")
    .select("id")
    .eq("custom_chat_id", customChatId)
    .maybeSingle();

  if (error) throw new ServiceError("Error fetching chat", 500);
  if (!chatRoom) throw new ServiceError("Chat room not found", 404);

  const { data: participant, error: pError } = await supabase
    .from("chat_participants")
    .select("is_pinned")
    .eq("chat_id", chatRoom.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (pError) throw new ServiceError("Error fetching participant", 500);
  if (!participant)
    throw new ServiceError("You are not a participant of this chat", 403);

  const newValue = !participant.is_pinned;

  await supabase
    .from("chat_participants")
    .update({ is_pinned: newValue })
    .eq("chat_id", chatRoom.id)
    .eq("user_id", userId);

  return {
    message: newValue
      ? "Chat pinned successfully"
      : "Chat unpinned successfully",
    isPinned: newValue,
  };
};

export const toggleFavoriteChatService = async (
  userId: string,
  customChatId: string,
) => {
  const { data: chatRoom, error } = await supabase
    .from("chats")
    .select("id")
    .eq("custom_chat_id", customChatId)
    .maybeSingle();

  if (error) throw new ServiceError("Error fetching chat", 500);
  if (!chatRoom) throw new ServiceError("Chat room not found", 404);

  const { data: participant, error: pError } = await supabase
    .from("chat_participants")
    .select("is_favorite")
    .eq("chat_id", chatRoom.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (pError) throw new ServiceError("Error fetching participant", 500);
  if (!participant)
    throw new ServiceError("You are not a participant of this chat", 403);

  const newValue = !participant.is_favorite;

  await supabase
    .from("chat_participants")
    .update({ is_favorite: newValue })
    .eq("chat_id", chatRoom.id)
    .eq("user_id", userId);

  return {
    message: newValue
      ? "Chat added to favorites successfully"
      : "Chat removed from favorites successfully",
    isFavorite: newValue,
  };
};

// ================================================================
// Save attachment — MongoDB (Attachment + Message)
// ================================================================
type SaveAttachmentPayload = {
  messageId: Types.ObjectId;
  chatId: string; // Postgres UUID
  uploadedBy: string; // Postgres UUID
  url: string;
  type: AttachmentType;
  name: string;
  size: number;
  mimeType: string;
  provider: "cloudinary" | "supabase";
  publicId?: string;
  path?: string;
};

export const saveAttachmentService = async (
  payload: SaveAttachmentPayload,
  rawChatId: string,
  transferId: string,
) => {
  const attachment = await Attachment.create({
    ...payload,
    publicId: payload.publicId ?? null,
    path: payload.path ?? null,
  });

  await MessageModel.findByIdAndUpdate(payload.messageId, {
    $set: { hasAttachments: true },
  });

  return {
    _id: attachment._id,
    messageId: attachment.messageId,
    chatId: rawChatId,
    uploadedBy: transferId,
    url: attachment.url,
    type: attachment.type,
    name: attachment.name,
    size: attachment.size,
    mimeType: attachment.mimeType,
    provider: attachment.provider,
    publicId: attachment.publicId,
    duration: attachment.duration,
  };
};

// ================================================================
// Chat lock PIN — Supabase (users.chat_lock_pin + chat_participants.is_locked)
// ================================================================
export const addGlobalChatLockPasswordService = async (
  userId: string,
  pin: string,
) => {
  const { data: user, error } = await supabase
    .from("users")
    .select("chat_lock_pin")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new ServiceError("Error fetching user", 500);
  if (!user) throw new ServiceError("User not found", 404);

  if (user.chat_lock_pin) {
    throw new ServiceError(
      "Chat lock PIN already set. Use change PIN option.",
      400,
    );
  }

  const hashedPin = await bcrypt.hash(pin, 10);
  await supabase
    .from("users")
    .update({ chat_lock_pin: hashedPin })
    .eq("id", userId);

  return true;
};

export const createChatLockServices = async (
  chatId: string,
  userId: string,
) => {
  const [{ data: chat, error: chatError }, { data: user, error: userError }] =
    await Promise.all([
      supabase
        .from("chats")
        .select("id")
        .eq("custom_chat_id", chatId)
        .maybeSingle(),
      supabase
        .from("users")
        .select("chat_lock_pin")
        .eq("id", userId)
        .maybeSingle(),
    ]);

  if (chatError) throw new ServiceError("Error fetching chat", 500);
  if (!chat) throw new ServiceError("Chat not found", 404);
  if (userError) throw new ServiceError("Error fetching user", 500);
  if (!user?.chat_lock_pin)
    throw new ServiceError("You have not set a chat lock PIN", 400);

  const { data: participant } = await supabase
    .from("chat_participants")
    .select("is_locked")
    .eq("chat_id", chat.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (participant?.is_locked) return true;

  await supabase
    .from("chat_participants")
    .update({ is_locked: true })
    .eq("chat_id", chat.id)
    .eq("user_id", userId);

  return {
    success: true,
    message: "Chat locked successfully",
    chatId: chat.id,
  };
};

export const verifyChatLockPinService = async (userId: string, pin: string) => {
  const { data: lockedChat, error } = await supabase
    .from("chat_participants")
    .select("chat_id")
    .eq("user_id", userId)
    .eq("is_locked", true)
    .limit(1)
    .maybeSingle();

  if (error) throw new ServiceError("Error checking locked chats", 500);
  if (!lockedChat)
    throw new ServiceError("No locked chat found for this user", 404);

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("chat_lock_pin")
    .eq("id", userId)
    .maybeSingle();

  if (userError) throw new ServiceError("Error fetching user", 500);
  if (!user) throw new ServiceError("User not found", 404);

  const isPinValid = await bcrypt.compare(pin, user.chat_lock_pin || "");
  if (!isPinValid) throw new ServiceError("Invalid PIN", 401);

  return true;
};

export const unlockChatService = async (userId: string, chatId: string) => {
  const { data: chat, error } = await supabase
    .from("chats")
    .select("id")
    .eq("custom_chat_id", chatId)
    .maybeSingle();

  if (error) throw new ServiceError("Error fetching chat", 500);
  if (!chat) throw new ServiceError("Chat not found", 404);

  const { data: participant } = await supabase
    .from("chat_participants")
    .select("is_locked")
    .eq("chat_id", chat.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!participant?.is_locked)
    throw new ServiceError("Chat is not locked by you", 403);

  await Promise.all([
    supabase
      .from("chat_participants")
      .update({ is_locked: false })
      .eq("chat_id", chat.id)
      .eq("user_id", userId),
    supabase.from("users").update({ chat_lock_pin: null }).eq("id", userId),
  ]);

  return true;
};

export const changeChatLockPinService = async (
  userId: string,
  oldPin: string,
  newPin: string,
) => {
  const { data: user, error } = await supabase
    .from("users")
    .select("chat_lock_pin")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new ServiceError("Error fetching user", 500);
  if (!user) throw new ServiceError("User not found", 404);

  const isOldPinValid = await bcrypt.compare(oldPin, user.chat_lock_pin || "");
  if (!isOldPinValid) throw new ServiceError("Invalid old PIN", 401);

  const hashedNewPin = await bcrypt.hash(newPin, 10);
  await supabase
    .from("users")
    .update({ chat_lock_pin: hashedNewPin })
    .eq("id", userId);

  return true;
};
