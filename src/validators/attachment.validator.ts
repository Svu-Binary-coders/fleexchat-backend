import { body } from "express-validator";
import mongoose from "mongoose";

export const confirmAttachmentValidator = [
  body("chatId")
    .notEmpty()
    .withMessage("chatId required")
    .isString()
    .withMessage("Invalid chatId")
    .isLength({ min: 15, max: 15 })
    .withMessage("chatId must be exactly 15 characters"),

  body("text")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 2000 })
    .withMessage("text too long"),

  body("messageId")
    .optional()
    .custom((v) => mongoose.isValidObjectId(v))
    .withMessage("Invalid messageId"),

  //  Array check
  body("attachments")
    .isArray({ min: 1, max: 5 })
    .withMessage("attachments must be an array with 1–5 items"),

  //  Array items
  body("attachments.*.url")
    .notEmpty()
    .withMessage("url required")
    .isURL()
    .withMessage("Invalid url"),

  body("attachments.*.type")
    .notEmpty()
    .isIn(["image", "video", "audio", "file", "VoiceMessage"])
    .withMessage("type must be image | video | audio | file | VoiceMessage"),

  body("attachments.*.name")
    .notEmpty()
    .withMessage("name required")
    .isString()
    .trim()
    .isLength({ max: 255 })
    .withMessage("name too long"),

  body("attachments.*.size")
    .notEmpty()
    .isInt({ min: 1, max: 50 * 1024 * 1024 })
    .withMessage("size must be between 1 byte and 50MB"),

  body("attachments.*.mimeType")
    .notEmpty()
    .withMessage("mimeType required")
    .isString(),

  body("attachments.*.provider")
    .notEmpty()
    .isIn(["cloudinary", "supabase"])
    .withMessage("provider must be cloudinary | supabase"),

  body("attachments.*.publicId").optional({ nullable: true }).isString(),

  body("attachments.*.path").optional({ nullable: true }).isString(),

  body("attachments").custom((attachments: any[]) => {
    for (const att of attachments) {
      if (["image", "video"].includes(att.type) && !att.publicId) {
        throw new Error("publicId required for image/video");
      }
      if (["audio", "file", "VoiceMessage"].includes(att.type) && !att.path) {
        throw new Error("path required for audio/file");
      }
      if (att.provider === "cloudinary" && !att.publicId) {
        throw new Error("publicId required when provider is cloudinary");
      }
      if (att.provider === "supabase" && !att.path) {
        throw new Error("path required when provider is supabase");
      }
    }
    return true;
  }),
];
