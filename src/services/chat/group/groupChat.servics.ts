import { supabase } from "../../../config/supabase.config.js";
import { MessageType } from "../../../enums/chat.enums.js";
import ServiceError from "../../../helper/servicesError.helper.js";
import { IGroupSettings } from "../../../interface/chat.interface.js";
import MessageModel from "../../../models/message.model.js";

// ===============================================
export const createGroupChatService = async (
  groupName: string,
  groupDescription: string,
  participantIds: string[], // UUIDs
  createdBy: string, // UUID
  groupSettings: IGroupSettings,
  userName: string,
) => {
  const uniqueParticipants = Array.from(
    new Set([...participantIds, createdBy]),
  );

  if (uniqueParticipants.length < 2) {
    throw new ServiceError(
      "A group chat must have at least 3 participants including the creator",
      400,
    );
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "create_group_chat",
    {
      p_group_name: groupName,
      p_group_description: groupDescription,
      p_participant_ids: participantIds,
      p_created_by: createdBy,
      p_group_settings: groupSettings,
    },
  );

  if (rpcError || !rpcData || rpcData.length === 0) {
    throw new ServiceError(
      `Failed to create group chat: ${rpcError?.message}`,
      500,
    );
  }

  const { chat_id, custom_chat_id } = rpcData[0];

  const { data: friendsPublicKeys } = await supabase
    .from("backup_keys")
    .select("user_id, public_key_64")
    .in("user_id", uniqueParticipants);

  const firstMessage = await MessageModel.create({
    chatId: chat_id,
    senderId: createdBy,
    content: `Group "${groupName}" created by user ${userName}`,
    messageType: MessageType.SYSTEM,
  });

  return {
    chat: {
      id: chat_id,
      custom_chat_id: custom_chat_id,
      is_group_chat: true,
      lastMessage: firstMessage,
      participantsCount: uniqueParticipants.length,
    },
    friendsPublicKeys: friendsPublicKeys?.map((f) => ({
      userId: f.user_id,
      publicKey: f.public_key_64,
    })),
  };
};

// ===============================================
// 2. Add Participants & Handle Requests
// ===============================================
export const addParticipantsToGroupChatService = async (
  chatId: string,
  newParticipantIds: string[],
  userId: string,
) => {
  if (newParticipantIds.length === 0) {
    throw new ServiceError("No participant IDs provided", 400);
  }

  const { data: chat } = await supabase
    .from("chats")
    .select("is_group_chat, group_settings")
    .eq("id", chatId)
    .single();

  if (!chat || !chat.is_group_chat)
    throw new ServiceError("Group chat not found", 404);

  const { data: currentUser } = await supabase
    .from("chat_participants")
    .select("is_admin")
    .eq("chat_id", chatId)
    .eq("user_id", userId)
    .single();

  const isAdmin = currentUser?.is_admin || false;

  const { data: existingParticipants } = await supabase
    .from("chat_participants")
    .select("user_id")
    .eq("chat_id", chatId);

  const existingParticipantStrings =
    existingParticipants?.map((p) => p.user_id) || [];

  // --- Admin Approval Logic (Join Request) ---
  const groupSettings = chat.group_settings as any;
  if (groupSettings?.isAdminInvitationsAllowed && !isAdmin) {
    const { data: pendingDocs } = await supabase
      .from("group_join_requests")
      .select("requested_by")
      .eq("chat_id", chatId)
      .eq("status", "pending")
      .in("requested_by", newParticipantIds);

    const alreadyPending = pendingDocs?.map((r) => r.requested_by) || [];

    const toRequest = newParticipantIds.filter(
      (id) =>
        !existingParticipantStrings.includes(id) &&
        !alreadyPending.includes(id),
    );

    if (toRequest.length === 0) {
      throw new ServiceError(
        "All selected users are already members or have pending requests",
        400,
      );
    }

    const requestsData = toRequest.map((reqId) => ({
      chat_id: chatId,
      requested_by: reqId,
      invited_by: userId,
      status: "pending",
    }));

    await supabase.from("group_join_requests").insert(requestsData);

    return {
      type: "pending",
      message: "Admin approval required. Requests sent.",
      pendingCount: toRequest.length,
      requestedIds: toRequest,
    };
  }

  // --- Direct Add Logic ---
  const addParticipants = newParticipantIds.filter(
    (newId) => !existingParticipantStrings.includes(newId),
  );

  if (addParticipants.length === 0) {
    throw new ServiceError("All selected users are already in the group", 400);
  }

  if (existingParticipantStrings.length + addParticipants.length > 100) {
    throw new ServiceError("Group member limit is 100", 400);
  }

  const insertData = addParticipants.map((id) => ({
    chat_id: chatId,
    user_id: id,
    is_admin: false,
  }));

  await supabase.from("chat_participants").insert(insertData);

  const systemMessages = addParticipants.map((participantId) => ({
    chatId,
    senderId: userId,
    content: `A user was added to the group via ${isAdmin ? "admin" : "invitation"}`,
    messageType: MessageType.SYSTEM,
  }));

  await MessageModel.insertMany(systemMessages);

  return {
    type: "added",
    message: `${addParticipants.length} participant(s) added successfully`,
    addedParticipantIds: addParticipants,
  };
};

// ===============================================
// 3. Approve Join Request (Using SQL RPC)
// ===============================================
export const approveJoinRequestService = async (
  requestId: string,
  adminId: string,
) => {
  const { data: statusStr, error } = await supabase.rpc(
    "approve_join_request",
    {
      p_request_id: requestId,
      p_admin_id: adminId,
    },
  );

  if (error) {
    throw new ServiceError(
      `Database error during approval: ${error.message}`,
      500,
    );
  }

  switch (statusStr) {
    case "not_found":
      throw new ServiceError("Join request not found", 404);
    case "not_pending":
      throw new ServiceError("Request already reviewed", 400);
    case "not_admin":
      throw new ServiceError("Admin access required", 403);
    case "limit_reached":
      throw new ServiceError("Group member limit is 100", 400);
    case "already_member":
    case "approved": {
      const { data: requestInfo } = await supabase
        .from("group_join_requests")
        .select("chat_id, requested_by")
        .eq("id", requestId)
        .single();

      if (statusStr === "approved" && requestInfo) {
        await MessageModel.create({
          chatId: requestInfo.chat_id,
          senderId: requestInfo.requested_by,
          content: `User joined the group`,
          messageType: MessageType.SYSTEM,
        });
      }

      return {
        type: statusStr,
        addedUserId: requestInfo?.requested_by,
      };
    }
    default:
      throw new ServiceError("Unknown error occurred", 500);
  }
};

// ===============================================
// 4. Reject Join Request
// ===============================================
export const rejectJoinRequestService = async (
  requestId: string,
  adminId: string,
) => {
  const { data: request } = await supabase
    .from("group_join_requests")
    .select("*")
    .eq("id", requestId)
    .single();
  if (!request || request.status !== "pending")
    throw new ServiceError("Request not found or already reviewed", 400);

  const { data: isAdmin } = await supabase
    .from("chat_participants")
    .select("is_admin")
    .eq("chat_id", request.chat_id)
    .eq("user_id", adminId)
    .single();

  if (!isAdmin?.is_admin) throw new ServiceError("Admin access required", 403);

  await supabase
    .from("group_join_requests")
    .update({
      status: "rejected",
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  return { type: "rejected", rejectedUserId: request.requested_by, request };
};

export const getPendingJoinRequestsService = async (
  chatId: string,
  adminId: string,
) => {
  const { data: isAdmin } = await supabase
    .from("chat_participants")
    .select("is_admin")
    .eq("chat_id", chatId)
    .eq("user_id", adminId)
    .single();

  if (!isAdmin?.is_admin) throw new ServiceError("Admin access required", 403);

  const { data: requests } = await supabase
    .from("group_join_requests")
    .select(
      `
      id, status, created_at,
      requested_by ( id, name, profile_image, user_id ),
      invited_by ( id, name, profile_image )
    `,
    )
    .eq("chat_id", chatId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return requests;
};

// ===============================================
// 5. Remove / Leave Group
// ===============================================
export const removeParticipantsFromGroupChatService = async (
  chatId: string,
  participantIdToRemove: string,
  userId: string,
  userName: string,
) => {
  const { error } = await supabase
    .from("chat_participants")
    .delete()
    .eq("chat_id", chatId)
    .eq("user_id", participantIdToRemove);

  if (error) throw new ServiceError("Failed to remove participant", 500);

  const systemMessage = await MessageModel.create({
    chatId: chatId,
    senderId: userId,
    content: `A participant was removed from the chat by ${userName}`,
    messageType: MessageType.SYSTEM,
  });

  return { systemMessage, removedParticipantId: participantIdToRemove };
};

export const leaveGroupChatService = async (
  chatId: string,
  participantIdToRemove: string,
) => {
  const { error } = await supabase
    .from("chat_participants")
    .delete()
    .eq("chat_id", chatId)
    .eq("user_id", participantIdToRemove);

  if (error) throw new ServiceError("Failed to leave group chat", 500);

  const systemMessage = await MessageModel.create({
    chatId: chatId,
    senderId: participantIdToRemove,
    content: `A user left the group chat`,
    messageType: MessageType.SYSTEM,
  });

  return { systemMessage, leftParticipantId: participantIdToRemove };
};

// ===============================================
// 6. Group Details & Participants
// ===============================================
export const getGroupChatDetailsService = async (chatId: string) => {
  const { data: chat, error } = await supabase
    .from("chats")
    .select(
      `
      id, custom_chat_id, group_name, group_description, group_avatar_url, group_settings,
      chat_participants (
        is_admin,
        users ( id, name, profile_image, user_id )
      )
    `,
    )
    .eq("id", chatId)
    .single();

  if (error || !chat) throw new ServiceError("Group chat not found", 404);

  const lastMessage = await MessageModel.findOne({ chatId })
    .sort({ createdAt: -1 })
    .select("content messageType createdAt")
    .lean();

  const participants =
    chat.chat_participants?.map((p: any) => ({
      ...p.users,
      isAdmin: p.is_admin,
    })) || [];

  participants.sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin));

  return {
    ...chat,
    participants: participants.slice(0, 10),
    totalParticipants: participants.length,
    lastMessage,
  };
};

export const getAllGroupParticipantsService = async (chatId: string) => {
  const { data: participants, error } = await supabase
    .from("chat_participants")
    .select(
      `
      is_admin,
      users ( id, name, profile_image, user_id )
    `,
    )
    .eq("chat_id", chatId);

  if (error) throw new ServiceError("Group chat not found", 404);

  const formatted = participants.map((p: any) => ({
    ...p.users,
    isAdmin: p.is_admin,
  }));

  formatted.sort((a, b) => {
    if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return {
    totalParticipants: formatted.length,
    participants: formatted,
  };
};

// ===============================================
// 7. Admin & Settings Handlers
// ===============================================
export const updateGroupChatSettingsService = async (
  chatId: string,
  newSettings: IGroupSettings,
) => {
  const { data: chat } = await supabase
    .from("chats")
    .select("group_settings")
    .eq("id", chatId)
    .single();
  if (!chat) throw new ServiceError("Group chat not found", 404);

  const updatedSettings = { ...(chat.group_settings as any), ...newSettings };

  await supabase
    .from("chats")
    .update({ group_settings: updatedSettings })
    .eq("id", chatId);
  return updatedSettings;
};

export const updateGroupChatInfoService = async (
  chatId: string,
  updateData: Partial<{
    groupName: string;
    groupDescription: string;
    groupAvatarUrl: string;
  }>,
) => {
  const updatePayload: any = {};
  if (updateData.groupName) updatePayload.group_name = updateData.groupName;
  if (updateData.groupDescription)
    updatePayload.group_description = updateData.groupDescription;
  if (updateData.groupAvatarUrl)
    updatePayload.group_avatar_url = updateData.groupAvatarUrl;

  const { data: updatedChat, error } = await supabase
    .from("chats")
    .update(updatePayload)
    .eq("id", chatId)
    .select("group_name, group_description, group_avatar_url")
    .single();

  if (error || !updatedChat)
    throw new ServiceError("Group chat not found", 404);
  return updatedChat;
};

export const makeUserAdminService = async (chatId: string, userId: string) => {
  const { error } = await supabase
    .from("chat_participants")
    .update({ is_admin: true })
    .eq("chat_id", chatId)
    .eq("user_id", userId);

  if (error) throw new ServiceError("Failed to make user admin", 500);
  return true;
};

export const removeAdminService = async (chatId: string, userId: string) => {
  const { error } = await supabase
    .from("chat_participants")
    .update({ is_admin: false })
    .eq("chat_id", chatId)
    .eq("user_id", userId);

  if (error) throw new ServiceError("Failed to remove admin", 500);
  return true;
};
