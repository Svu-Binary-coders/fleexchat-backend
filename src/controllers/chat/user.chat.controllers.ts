import { Response, Request, NextFunction } from "express";
import {
  addGlobalChatLockPasswordService,
  changeChatLockPinService,
  createChatLockServices,
  createNewChatRoomServices,
  getLinkPreviewService,
  loadAllChatMessages,
  loadAllContacts,
  searchUserName,
  toggleFavoriteChatService,
  togglePinChatService,
  unlockChatService,
  verifyChatLockPinService,
} from "../../services/chat/user.chat.services.js";
import { Types } from "mongoose";
import { getInternalUuid } from "../../redis/getInternalUserUuid.js";
import {
  getOthersUsersProfileService,
  getUserDetailsService,
  searchUsersService,
} from "../../services/auth.services.js";
import { getPublicKeyForUser } from "../../services/chat/backupKey.services.js";
import { getChatSQLId } from "../../redis/chat/getSQLId.redis.js";

export const getUserDetails = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { userId } = res.locals.user;
  const { q } = req.query;
  if (!q || !(q as string).trim()) {
    return res
      .status(400)
      .json({ message: "Search query required", success: false });
  }
  try {
    const users = await searchUserName(q as string, userId);
    res.status(200).json({ success: true, users });
  } catch (error) {
    next(error);
  }
};

export const getAllChatMessages = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { roomId, receiverId } = req.params;
    const { cursor, limit = "20" } = req.query;
    const userId = res.locals.user.userId;
    const chatUUID = await getChatSQLId(roomId as string);
    if (!roomId || !receiverId) {
      return res.status(400).json({
        message: "roomId and receiverId are required",
        success: false,
      });
    }

    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string) || 20));

    const messagesData = await loadAllChatMessages(
      userId,
      chatUUID as string,
      false, // isGroup
      limitNum,
      cursor as string | undefined,
    );

    res.status(200).json({ success: true, ...messagesData });
  } catch (error) {
    next(error);
  }
};

export const getContacts = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { userId } = res.locals.user;

    const contacts = await loadAllContacts(userId);

    res.status(200).json({ success: true, contacts });
  } catch (error) {
    next(error);
  }
};

export const createNewChatRoom = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { senderId, receiverId } = req.body;

  if (!senderId || !receiverId) {
    res.status(400).json({
      success: false,
      message: "senderId and receiverId are required",
    });
    return;
  }

  const getSenderUUID = await getInternalUuid(senderId as string);
  const getReceiverUUID = await getInternalUuid(receiverId as string);

  try {
    const [newRoom, PublicKey] = await Promise.all([
      createNewChatRoomServices(getSenderUUID, getReceiverUUID),
      getPublicKeyForUser(getReceiverUUID),
    ]);

    const isNew = !newRoom.isExisting;
    res
      .status(isNew ? 201 : 200)
      .json({ success: true, chat: newRoom, publicKey: PublicKey });
  } catch (error) {
    next(error);
  }
};

export const getUserProfile = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = res.locals.user.userId;
    const userProfile = await getUserDetailsService(userId);

    res.status(200).json({
      success: true,
      user: userProfile,
    });
  } catch (error) {
    next(error);
  }
};

export const searchUserNameController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { q } = req.query;

  if (!q || !(q as string).trim()) {
    return res
      .status(400)
      .json({ message: "Search query required", success: false });
  }
  try {
    const users = await searchUsersService(q as string);
    res.status(200).json({ success: true, users });
    console.log("Search results:", users);
  } catch (error) {
    next(error);
  }
};

export const viewOthersUserProfile = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { userId } = req.params as { userId: string };
    console.log(`Fetching profile for userId: ${userId}`);
    const userProfile = await getOthersUsersProfileService(userId);
    res.status(200).json({ success: true, user: userProfile });
  } catch (error) {
    next(error);
  }
};

export const getLinkPreview = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { url } = req.query;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ success: false, message: "URL is required" });
  }
  const decodedUrl: string = decodeURIComponent(url);
  try {
    const result = await getLinkPreviewService(decodedUrl);
    if (result) {
      res.status(200).json({ success: true, preview: result });
    } else {
      res
        .status(404)
        .json({ success: false, message: "Link preview not found" });
    }
  } catch (error) {
    next(error);
  }
};

export const togglePinChatController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { userId } = res.locals.user;
  const { customChatId } = req.params;
  if (!customChatId) {
    return res
      .status(400)
      .json({ success: false, message: "customChatId is required" });
  }
  try {
    const result = await togglePinChatService(userId, customChatId as string);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

export const toggleFavoriteChatController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { userId } = res.locals.user;
  const { customChatId } = req.params;
  if (!customChatId) {
    return res
      .status(400)
      .json({ success: false, message: "customChatId is required" });
  }
  try {
    const result = await toggleFavoriteChatService(
      userId,
      customChatId as string,
    );
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

export const addGlobalChatLockPasswordController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { userId } = res.locals.user;
  const { pin } = req.body;
  if (!pin) {
    return res.status(400).json({ success: false, message: "Pin is required" });
  }
  try {
    await addGlobalChatLockPasswordService(userId, pin);
    res.status(200).json({
      success: true,
      message: "Chat lock password added successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const createChatLockController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { userId } = res.locals.user;
  const { customChatId } = req.params;
  if (!customChatId) {
    return res
      .status(400)
      .json({ success: false, message: "customChatId is required" });
  }
  try {
    const result = await createChatLockServices(customChatId as string, userId);
    res
      .status(200)
      .json({ success: true, message: "Chat lock created successfully" });
  } catch (error) {
    next(error);
  }
};

export const verifyChatLockPinController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { userId } = res.locals.user;
  const { pin } = req.body;

  if (!pin) {
    return res.status(400).json({ success: false, message: "Pin is required" });
  }

  try {
    const result = await verifyChatLockPinService(userId, pin);
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const unlockChatController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { userId } = res.locals.user;
  const { customChatId } = req.params;
  if (!customChatId) {
    return res
      .status(400)
      .json({ success: false, message: "ChatId is required" });
  }

  try {
    await unlockChatService(userId, customChatId as string);
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const changeChatLockPinController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { userId } = res.locals.user;
  const { oldPin, pin } = req.body;

  if (!oldPin || !pin) {
    return res
      .status(400)
      .json({ success: false, message: "Old pin and new pin are required" });
  }

  try {
    await changeChatLockPinService(userId, oldPin, pin);
    res
      .status(200)
      .json({ success: true, message: "Chat lock pin changed successfully" });
  } catch (error) {
    next(error);
  }
};
