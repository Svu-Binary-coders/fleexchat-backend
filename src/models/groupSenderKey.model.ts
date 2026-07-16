import { Schema, model } from "mongoose";

const EncryptedKeySchema = new Schema(
  {
    recipientId: {
      type: String, // PostgreSQL UUID
      required: true,
    },
    encryptedChainKey: {
      type: String,
      required: true,
    },
  },
  { _id: false },
);

const GroupSenderKeySchema = new Schema(
  {
    chatId: {
      type: String, // PostgreSQL UUID
      required: true,
    },
    senderId: {
      type: String, // PostgreSQL UUID
      required: true,
    },
    encryptedKeys: [EncryptedKeySchema],

    // current rotation version
    version: {
      type: Number,
      default: 1,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

// index — fast lookup
GroupSenderKeySchema.index({ chatId: 1, senderId: 1, isActive: 1 });
GroupSenderKeySchema.index({ chatId: 1, isActive: 1 });

export default model("GroupSenderKey", GroupSenderKeySchema);