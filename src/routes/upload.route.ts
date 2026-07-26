import { Router } from "express";
import {
  updateAvatarController,
  deleteAvatarController,
  getMediaSignatureController,
  getSupabaseSignedUrlController,
  addGroupChatImageController,
  deleteChatImageController,
} from "../controllers/upload.controllers.js";


import { confirmAttachmentController } from "../controllers/chat/attachment.controllers.js";
import { confirmAttachmentValidator } from "../validators/attachment.validator.js";
import { validateExpress } from "../validators/validateExpress.validetor.js";
import { verifyJWTMiddleware } from "../middleware/auth/jwtValidate.middleware.js";

const router = Router();

// ===============================================
// 1. Profile Picture (Avatar)
// ===============================================
router.post("/avatar", verifyJWTMiddleware, updateAvatarController);

router.delete("/avatar", verifyJWTMiddleware, deleteAvatarController);

// ===============================================
// 2. Cloudinary Dynamic Signature (Images, Videos, Avatars)
// ===============================================
router.post("/sign-media", verifyJWTMiddleware, getMediaSignatureController);

// ===============================================
// 3. Supabase Signature (Audio, Files)
// ===============================================
router.post(
  "/sign-supabase",
  verifyJWTMiddleware,
  getSupabaseSignedUrlController,
);

// ===============================================
// 4. Confirm Chat Attachments
// ===============================================
router.post(
  "/confirm-attachment",
  verifyJWTMiddleware,
  confirmAttachmentValidator,
  validateExpress,
  confirmAttachmentController,
);

// ===============================================
// 5. Group Chat Image
// ===============================================
router.post(
  "/group-chat-image/:chatId",
  verifyJWTMiddleware,
  addGroupChatImageController,
);

router.delete(
  "/group-chat-image/:chatId",
  verifyJWTMiddleware,
  deleteChatImageController,
);

export default router;
