import mongoose, { Document, Types } from "mongoose";
import type {
  AttachmentType,
  FriendRequestStatus,
  MediaType,
  MessageStatus,
  MessageType,
  StorageProvider,
} from "../enums/chat.enums.js";

export interface IChat extends Document {
  participants: Types.ObjectId[];
  customChatId: string;
  pinBy: Types.ObjectId[];
  FavoriteBy?: Types.ObjectId[];
  friendRequestStatus: FriendRequestStatus;
  isGroupChat: boolean;
  groupName?: string;
  groupAvatarUrl?: string;
  groupAvatarPublicId?: string;
  groupDescription?: string;
  groupAdmins?: Types.ObjectId[];
  createdBy?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
  lastMessage?: Types.ObjectId;
  chatLockedBy?: Types.ObjectId[];
  groupSettings?: IGroupSettings;
}

export interface IMessage extends Document {
  chatId: string;
  senderId: string;
  reactions: { userId: Types.ObjectId; reaction: string }[];
  messageType: MessageType;
  content: string;
  attachments?: Types.ObjectId[];
  hasAttachments: boolean;
  messageStatus: MessageStatus;
  replyTo?: Types.ObjectId;
  is_edited?: boolean;
  isDeleted?: boolean;
  isImportant?: boolean;
  is_forwarded?: boolean;
  read_by: Types.ObjectId[];
  is_view_once?: boolean;
  is_deleted_for_everyone?: boolean;
  delete_by?: Types.ObjectId[];
  createdAt?: Date;
  updatedAt?: Date;
  expiresAt?: Date; // for disappearing messages
}

export interface IFriendRequest extends Document {
  requestId: string;
  senderId: Types.ObjectId;
  receiverId: Types.ObjectId;
  status: FriendRequestStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ILinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

export interface IAttachment extends Document {
  messageId: Types.ObjectId;
  chatId:string;
  uploadedBy: string;
  url: string;
  type: AttachmentType;
  name: string;
  size: number;
  mimeType: string;
  provider: StorageProvider;
  duration?: number; // for video and audio
  // Cloudinary
  publicId?: string | null;
  // Supabase
  path?: string | null;

  createdAt: Date;
}

export interface IGroupSettings {
  isAdminOnlyMessaging?: boolean;
  isAdminInvitationsAllowed?: boolean;
  inviteViaURL?: boolean;
  canEditGroupInfo?: boolean;
}
