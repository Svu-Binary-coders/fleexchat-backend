import mongoose, { Schema } from "mongoose";
import { IAttachment } from "../interface/chat.interface.js";
import { ATTACHMENT_TYPES } from "../enums/chat.enums.js";

const AttachmentSchema = new Schema<IAttachment>(
  {
    messageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      required: true,
    },
    chatId: {
      type: String, // PostgreSQL UUID
      required: true,
    },
    uploadedBy: {
      type: String, // PostgreSQL UUID
      required: true,
    },

    url: { type: String, required: true },
    type: {
      type: String,
      enum: ATTACHMENT_TYPES,
      required: true,
    },
    name: { type: String, required: true },
    size: { type: Number, required: true },
    duration: { type: Number, default: null },
    mimeType: { type: String, required: true },
    provider: {
      type: String,
      enum: ["cloudinary", "supabase"],
      required: true,
    },

    publicId: { type: String, default: null },
    path: { type: String, default: null },
  },
  { timestamps: true },
);

AttachmentSchema.index({ messageId: 1 });
AttachmentSchema.index({ uploadedBy: 1, createdAt: -1 });
AttachmentSchema.index({ path: 1 }, { sparse: true });
AttachmentSchema.index({ publicId: 1 }, { sparse: true });

AttachmentSchema.index({ chatId: 1, type: 1, createdAt: -1 });

export const Attachment = mongoose.model<IAttachment>(
  "Attachment",
  AttachmentSchema,
);
