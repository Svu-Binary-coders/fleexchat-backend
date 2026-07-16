import { model, Model, Schema, Types } from "mongoose";
import type { IMessage } from "../interface/chat.interface.js";
import { MessageStatus, MessageType } from "../enums/chat.enums.js";
import { fileDeletionQueue } from "../bullMQ/queues/fileDeletionQueqe.js";
import { Attachment } from "./attachments.model.js";

const MessageSchema = new Schema<IMessage>(
  {
    chatId: {
      type: String, // PostgreSQL UUID
      required: true,
    },
    senderId: {
      type: String, // PostgreSQL UUID
      required: true,
    },
    messageType: {
      type: String,
      enum: Object.values(MessageType),
      required: true,
      default: MessageType.TEXT,
    },
    content: { type: String, default: "" },
    hasAttachments: { type: Boolean, default: false },
    attachments: {
      type: [{ type: Schema.Types.ObjectId, ref: "Attachment" }],
      default: [],
    },
    messageStatus: {
      type: String,
      enum: Object.values(MessageStatus),
      default: MessageStatus.SENT,
    },
    reactions: [
      {
        userId: { type: String, required: true }, // PostgreSQL UUID
        reaction: { type: String },
      },
    ],
    replyTo: { type: Schema.Types.ObjectId, ref: "Message", default: null },
    is_edited: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    isImportant: { type: Boolean, default: false },
    is_forwarded: { type: Boolean, default: false },

    read_by: [{ type: String }], // PostgreSQL UUIDs
    delete_by: [{ type: String }], // PostgreSQL UUIDs

    is_view_once: { type: Boolean, default: false },
    is_deleted_for_everyone: { type: Boolean, default: false },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

MessageSchema.index({ chatId: 1, createdAt: -1 });
MessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

MessageSchema.pre("deleteOne", { document: true }, async function () {
  if (this.hasAttachments && (this.attachments?.length ?? 0) > 0) {
    const attachments = await Attachment.find(
      { _id: { $in: this.attachments ?? [] } },
      { publicId: 1, path: 1, provider: 1, type: 1 },
    ).lean();

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

    await Attachment.deleteMany({ _id: { $in: this.attachments ?? [] } });
  }
});

const MessageModel: Model<IMessage> = model<IMessage>("Message", MessageSchema);

export default MessageModel;
