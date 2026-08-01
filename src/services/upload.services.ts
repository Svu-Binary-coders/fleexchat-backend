import {
  deleteFromCloudinary,
  generateMediaSignature,
} from "../helper/cloudinary.helper.js";
import { supabase } from "../config/supabase.config.js";
import ServiceError from "../helper/servicesError.helper.js";
import { Attachment } from "../models/attachments.model.js";
import { AttachmentType } from "../enums/chat.enums.js";
import { getChatSQLId } from "../redis/chat/getSQLId.redis.js";
import { MediaTypeEnums } from "../enums/cloud.enums.js";

// ==========================================
// 1. Cloudinary Signature (For Video & Image)
// ==========================================

/**
 * Use this service to generate a media signature for uploading media files (images or videos) to Cloudinary.
 * @param fileSize Size of the file in bytes max 20MB for images and 100MB for videos
 * @param fileName Name of the file to be uploaded
 * @param type Type of media to be uploaded, either "image" or "video"
 * @throws ServiceError if the file size exceeds the maximum allowed size for the specified media type
 * @returns An object containing the media signature and other necessary parameters for uploading the media file to Cloudinary
 */
export const getMediaSignatureService = (
  fileSize: number,
  fileName: string,
  type: (typeof MediaTypeEnums)[keyof typeof MediaTypeEnums],
) => {
  return generateMediaSignature(fileSize, fileName, type);
};

// ==========================================
// 2. Audio/File Uploads (Frontend -> Supabase)
// ==========================================

/**
 * Generates a signed URL for uploading files to Supabase storage.
 * @param {string} fileName Name of the file to be uploaded
 * @param {string} fileType Type of the file to be uploaded, either "audio" or "file"
 * @param {number} fileSize Size of the file in bytes
 * @returns An object containing the signed URL and other necessary parameters for uploading the file to Supabase
 */
export const getSupabaseSignedUrlService = async (
  fileName: string,
  fileType: "audio" | "file",
  fileSize: number,
) => {
  const maxBytes =
    fileType === "audio"
      ? 20 * 1024 * 1024 // 20MB
      : 30 * 1024 * 1024; // 30MB
  if (fileSize > maxBytes) {
    throw new ServiceError(
      `File too large. Max: ${maxBytes / 1024 / 1024}MB`,
      400,
    );
  }

  const cleanName = fileName
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9.\-_]/g, "")
    .toLowerCase();

  const folder = fileType === "audio" ? "chat-audios" : "chat-files";
  const filePath = `${folder}/${Date.now()}-${cleanName}`;

  const { data, error } = await supabase.storage
    .from("flex-chat")
    .createSignedUploadUrl(filePath);

  if (error) throw new ServiceError(`Supabase error: ${error.message}`, 500);

  const { data: urlData } = supabase.storage
    .from("flex-chat")
    .getPublicUrl(data.path);

  return {
    uploadUrl: data.signedUrl,
    path: data.path,
    publicUrl: urlData.publicUrl,
  };
};

// ==========================================
// 3. Profile Picture (PostgreSQL) - Confirmation
// ==========================================

/**
 * Use this service to update a user's profile picture in the database and delete the previous profile picture from Cloudinary if it exists.
 * @param userId -  user UUID of the user whose profile picture is to be updated
 * @param url - new URL of the profile picture to be set for the user
 * @param publicId - public ID of the new profile picture in Cloudinary
 * @throws ServiceError if the user is not found or if there is an error updating the profile picture
 * @returns An object containing the new URL and public ID of the updated profile picture
 */
export const updateProfilePictureService = async (
  userId: string,
  url: string,
  publicId: string,
): Promise<{ url: string; publicId: string }> => {
  const { data: user, error } = await supabase
    .from("users")
    .select("profile_image_key")
    .eq("id", userId)
    .single();

  if (error) {
    throw new ServiceError(`Supabase error: ${error.message}`, 500);
  }

  if (user?.profile_image_key) {
    await deleteFromCloudinary(user.profile_image_key, "image");
  }

  await supabase
    .from("users")
    .update({ profile_image: url, profile_image_key: publicId })
    .eq("id", userId);

  return { url, publicId };
};

/**
 * Use this service to delete a user's profile picture from the database and Cloudinary if it exists.
 * @param userId - user UUID of the user whose profile picture is to be deleted
 * @throws ServiceError if the user is not found or if there is an error deleting the profile picture
 */
export const deleteProfilePictureService = async (userId: string) => {
  const { data: user, error } = await supabase
    .from("users")
    .select("profile_image_key")
    .eq("id", userId)
    .single();

  if (error || !user) {
    throw new ServiceError("User not found", 404);
  }

  if (user?.profile_image_key) {
    await deleteFromCloudinary(user.profile_image_key, "image");

    await supabase
      .from("users")
      .update({ profile_image_key: null, profile_image: null })
      .eq("id", userId);
  }
};

// ==========================================
// 4. Group Chat Images (PostgreSQL) - Confirmation
// ==========================================
export const addGroupChatImageService = async (
  chatId: string,
  url: string,
  publicId: string,
) => {
  const { data: chat, error } = await supabase
    .from("chats")
    .select("group_avatar_key")
    .eq("id", chatId)
    .single();

  if (error || !chat) {
    throw new ServiceError("Group chat not found", 404);
  }

  if (chat.group_avatar_key) {
    await deleteFromCloudinary(chat.group_avatar_key, "image");
  }

  await supabase
    .from("chats")
    .update({ group_avatar_url: url, group_avatar_key: publicId })
    .eq("id", chatId);

  return { url, publicId };
};

export const deleteChatImageService = async (chatId: string) => {
  const { data: chat, error } = await supabase
    .from("chats")
    .select("group_avatar_key")
    .eq("id", chatId)
    .single();

  if (error || !chat) {
    throw new ServiceError("Group chat not found", 404);
  }
  if (!chat.group_avatar_key) {
    throw new ServiceError("Group chat image not found", 404);
  }

  await deleteFromCloudinary(chat.group_avatar_key, "image");

  await supabase
    .from("chats")
    .update({ group_avatar_url: null, group_avatar_key: null })
    .eq("id", chatId);
};

// ==========================================
// 5. Media Delete Service
// ==========================================
export const deleteMediaService = async (
  publicId: string | null,
  path: string | null,
  provider: "cloudinary" | "supabase",
  type: AttachmentType,
) => {
  if (provider === "cloudinary") {
    if (!publicId) throw new Error("Missing publicId for cloudinary delete");
    const resourceType = type === "video" ? "video" : "image";
    await deleteFromCloudinary(publicId, resourceType);
  } else if (provider === "supabase") {
    if (!path) throw new Error("Missing path for supabase delete");
    await supabase.storage.from("chat-media").remove([path]);
  } else {
    throw new Error(`Unknown provider: ${provider}`);
  }
};

// ==========================================
// 6. Get All Attachments (MongoDB -> Supabase Lookup)
// ==========================================
export const getAllAttachmentsForChatService = async (chatId: string) => {
  const chatUUID = await getChatSQLId(chatId);

  const attachments = await Attachment.find({ chatId: chatUUID })
    .sort({ createdAt: -1 })
    .select("uploadedBy url type name size mimeType createdAt -_id")
    .lean();

  if (attachments.length === 0) return [];

  const userIds = [...new Set(attachments.map((att) => att.uploadedBy))];

  const { data: users } = await supabase
    .from("users")
    .select("id, name, profile_image")
    .in("id", userIds);

  const usersMap = new Map(users?.map((u) => [u.id, u]) || []);

  const populatedAttachments = attachments.map((att) => ({
    ...att,
    uploadedBy: usersMap.get(att.uploadedBy as string) || {
      id: att.uploadedBy,
      name: "Unknown User",
    },
  }));

  return populatedAttachments;
};
