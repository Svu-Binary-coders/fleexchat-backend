import { supabase } from "../../../config/supabase.config.js";
import ServiceError from "../../../helper/servicesError.helper.js";
import GroupSenderKeyModel from "../../../models/groupSenderKey.model.js";
// ===============================================
export const saveSenderKeyService = async (
  chatId: string, // UUID
  senderId: string, // UUID
  encryptedKeys: { recipientId: string; encryptedChainKey: string }[],
) => {
  const { data: chat, error: chatError } = await supabase
    .from("chats")
    .select("is_group_chat")
    .eq("id", chatId)
    .single();

  if (chatError || !chat) throw new ServiceError("Group not found", 404);
  if (!chat.is_group_chat) throw new ServiceError("Not a group chat", 400);

  const { data: participant } = await supabase
    .from("chat_participants")
    .select("user_id")
    .eq("chat_id", chatId)
    .eq("user_id", senderId)
    .single();

  if (!participant) throw new ServiceError("Not a group member", 403);

  await GroupSenderKeyModel.updateMany(
    { chatId, senderId, isActive: true },
    { $set: { isActive: false } },
  );

  const senderKey = await GroupSenderKeyModel.create({
    chatId,
    senderId,
    encryptedKeys: encryptedKeys.map((k) => ({
      recipientId: k.recipientId, // String (UUID)
      encryptedChainKey: k.encryptedChainKey,
    })),
    isActive: true,
  });

  return senderKey;
};

export const getSenderKeysForMemberService = async (
  chatId: string, // UUID
  recipientId: string, // UUID
) => {
  const allKeys = await GroupSenderKeyModel.find({
    chatId: chatId,
    isActive: true,
    "encryptedKeys.recipientId": recipientId,
  })
    .select({
      senderId: 1,
      version: 1,
      encryptedKeys: { $elemMatch: { recipientId: recipientId } },
    })
    .lean();

  const result = allKeys
    .map((k) => {
      if (!k.encryptedKeys || k.encryptedKeys.length === 0) return null;
      const myKey = k.encryptedKeys[0];
      return {
        senderId: k.senderId,
        encryptedChainKey: myKey?.encryptedChainKey,
        version: k.version,
      };
    })
    .filter(Boolean);

  return result;
};

export const invalidateSenderKeysService = async (
  chatId: string, // UUID
  removedUserId: string, // UUID
) => {
  await GroupSenderKeyModel.updateMany(
    { chatId, isActive: true },
    { $set: { isActive: false } },
  );
  await GroupSenderKeyModel.updateMany(
    { chatId, senderId: removedUserId },
    { $set: { isActive: false } },
  );
};