import { Request, Response, NextFunction } from "express";
import {
  getSenderKeysForMemberService,
  saveSenderKeyService,
} from "../../services/chat/group/groupSenderKey.servics.js";
import { getChatSQLId } from "../../redis/chat/getSQLId.redis.js";

export const saveSenderKeyController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const chatId = req.params.chatId as string;
  const { userId } = res.locals.user;
  try {
    const senderId = await getChatSQLId(chatId);
    const { encryptedKeys } = req.body;

    if (!Array.isArray(encryptedKeys) || encryptedKeys.length === 0) {
      res.status(400).json({
        success: false,
        message: "encryptedKeys array required",
      });
      return;
    }

    if (!senderId) {
      res.status(404).json({
        success: false,
        message: "Chat not found",
      });
      return;
    }

    await saveSenderKeyService(senderId, senderId, encryptedKeys);

    res.status(200).json({
      success: true,
      message: "Sender key saved",
    });
  } catch (error) {
    next(error);
  }
};

export const getSenderKeysController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const chatId = req.params.chatId as string;
    const { userId } = res.locals.user;
    console.log("Chat ID:", chatId);
    const chatSqlId = await getChatSQLId(chatId);
    console.log("getChatMongoDbId:", chatSqlId);
    if (!chatSqlId) {
      res.status(404).json({
        success: false,
        message: "Chat not found",
      });
      return;
    }

    const senderKeys = await getSenderKeysForMemberService(chatSqlId, userId);

    res.status(200).json({
      success: true,
      senderKeys,
    });
  } catch (error) {
    next(error);
  }
};
