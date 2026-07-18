import { NextFunction, Response, Request } from "express";
import {
  addParticipantsToGroupChatService,
  createGroupChatService,
  getAllGroupParticipantsService,
  getGroupChatDetailsService,
  removeParticipantsFromGroupChatService,
} from "../../services/chat/group/groupChat.servics.js";
import { Types } from "mongoose";
import { IGroupSettings } from "../../interface/chat.interface.js";

/**
 *
 * @param req this will have groupName, groupDescription, participantIds, groupSettings in the body and userId in res.locals.users
 * @param res   this will return the newly created group chat object in json format with status code 201 if successful, otherwise it will return a json with message "Failed to create group chat" and status code 400
 * @param next pass the error to the next middleware if any error occurs
 * @returns  all the details of the newly created group chat in json format with status code 201 if successful, otherwise it will return a json with message "Failed to create group chat" and status code 400
 * @description This controller is responsible for creating a new group chat. It will first validate the request body and then call the service function to create the group chat. If the group chat is created successfully, it will return the newly created group chat object in json format with status code 201, otherwise it will return a json with message "Failed to create group chat" and status code 400
 */

export const createGroupChat = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { userId } = res.locals.user;
  console.log("userId in createGroupChat controller:", userId);
  const { groupName, groupDescription, participantIds, groupSettings } =
    req.body;

  try {
    const newGroupChat = await createGroupChatService(
      groupName,
      groupDescription,
      participantIds,
      userId,
      groupSettings as IGroupSettings,
      res.locals.user.userName,
    );
    if (!newGroupChat) {
      return res.status(400).json({ message: "Failed to create group chat" });
    }
    res.status(201).json({ newGroupChat, success: true });
  } catch (error) {
    next(error);
  }
};

export const addParticipantsToGroupChat = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { userId } = res.locals.user;
  const { chatId } = req.params;
  const { participantIds } = req.body;

  try {
    if (!chatId || Array.isArray(chatId)) {
      return res.status(400).json({ message: "Invalid chatId" });
    }
    const addParticipantsResult = await addParticipantsToGroupChatService(
      chatId,
      participantIds,
      userId,
    );
    if (!addParticipantsResult) {
      return res
        .status(400)
        .json({ message: "Failed to add participants to group chat" });
    }
    res.status(200).json({
      message: "Participants added to group chat successfully",
      success: true,
    });
  } catch (error) {
    next(error);
  }
};

export const removeParticipantFromGroupChat = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { userId, userName } = res.locals.user;
  const { chatId } = req.params;
  const { participantIds } = req.body;
  console.log("Get removed participantId in controller:", participantIds);

  try {
    if (!chatId || Array.isArray(chatId)) {
      return res.status(400).json({ message: "Invalid chatId" });
    }
    const result = await removeParticipantsFromGroupChatService(
      chatId,
      participantIds,
      userId,
      userName,
    );
    if (!result) {
      return res
        .status(400)
        .json({ message: "Failed to remove participant from group chat" });
    }
    res.status(200).json({
      message: "Participant removed from group chat successfully",
      success: true,
    });
  } catch (error) {
    next(error);
  }
};

// get group chat details by chatId
export const getGroupChatDetails = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { chatId } = req.params;
  try {
    if (!chatId || Array.isArray(chatId)) {
      return res.status(400).json({ message: "Invalid chatId" });
    }
    const chatDetails = await getGroupChatDetailsService(chatId);
    res.status(200).json({ chatDetails, success: true });
  } catch (error) {
    next(error);
  }
};

export const getAllGroupParticipants = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { chatId } = req.params;

  try {
    if (!chatId || Array.isArray(chatId)) {
      return res.status(400).json({ message: "Invalid chatId" });
    }
    const participants = await getAllGroupParticipantsService(chatId);
    res.status(200).json({ participants, success: true });
  } catch (error) {
    next(error);
  }
};

export const addGroupAvatar = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { chatId } = req.params;
};
