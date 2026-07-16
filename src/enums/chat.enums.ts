/**
 * `image`, `video`, `audio`, `system`, `document`, `zip`, `other`
 */
export enum MediaType {
  IMAGE = "image",
  VIDEO = "video",
  AUDIO = "audio",
  SYSTEM = "system",
  DOCUMENT = "document",
  ZIP = "zip",
  OTHER = "other",
}
/**
 * `text`, `media`
 */
export enum MessageType {
  TEXT = "text",
  MEDIA = "media",
  SYSTEM = "system",
}

/**
 * `sending`, `sent`, `delivered`, `read`, `failed`
 */

export enum MessageStatus {
  SENDING = "sending",
  SENT = "sent",
  DELIVERED = "delivered",
  READ = "read",
  FAILED = "failed",
}
/**
 * `private`, `group`, `friendly`
 */
export enum ChatType {
  PRIVATE = "private",
  GROUP = "group",
  FRIENDLY = "friendly",
}

/**
 * `message`, `friend_request`, `system_alert`
 */
export enum NotificationType {
  MESSAGE = "message",
  FRIEND_REQUEST = "friend_request",
  SYSTEM_ALERT = "system_alert",
}
/**
 * `unread`, `read`, `archived`
 */
export enum NotificationStatus {
  UNREAD = "unread",
  READ = "read",
  ARCHIVED = "archived",
}

/**
 * `pending`, `accepted`, `rejected`
 */
export enum FriendRequestStatus {
  PENDING = "pending",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
  BLOCKED = "blocked",
}
/**
 * `audio`, `video`
 */
export enum CallType {
  AUDIO = "audio",
  VIDEO = "video",
}

/**
 * `ringing`, `answered`, `ended`, `missed`
 */

export enum CallStatus {
  RINGING = "ringing",
  ANSWERED = "answered",
  ENDED = "ended",
  MISSED = "missed",
}

/**
 * `registration`, `password_reset`, `two_factor_auth`, `new_device_login`
 */
export enum OTPType {
  REGISTRATION = "registration",
  PASSWORD_RESET = "password_reset",
  TWO_FACTOR_AUTH = "two_factor_auth",
  NEW_DEVICE_LOGIN = "new_device_login",
  EMAIL_CHANGE = "email_change",
}

export const ATTACHMENT_TYPES = [
  "image",
  "video",
  "audio",
  "file",
  "VoiceMessage",
] as const;

export type AttachmentType = (typeof ATTACHMENT_TYPES)[number];
export type StorageProvider = "cloudinary" | "supabase";
