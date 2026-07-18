import { Router } from "express";
import {
  updateAvatarController,
  deleteAvatarController,
  uploadChatImageController,
  getVideoSignatureController,
  getSupabaseSignedUrlController,
  addGroupChatImageController,
  deleteChatImageController,
} from "../controllers/chat/upload.controllers.js";
import { uploadImage, uploadMedia } from "../middleware/upload/multer.middleware.js";
import { confirmAttachmentController } from "../controllers/chat/attachment.controllers.js";
import { confirmAttachmentValidator } from "../validators/attachment.validator.js";
import { validateExpress } from "../validators/validateExpress.validetor.js";
import { verifyJWTMiddleware } from "../middleware/auth/jwtValidate.middleware.js";

const router = Router();

//  Profile Picture
router.post(
  "/avatar",
  verifyJWTMiddleware,
  uploadImage.single("avatar"),
  updateAvatarController,
);

router.delete("/avatar", verifyJWTMiddleware, deleteAvatarController);

router.post(
  "/chat-image",
  verifyJWTMiddleware,
  uploadMedia.single("media"),
  uploadChatImageController,
);

router.post("/sign-video", verifyJWTMiddleware, getVideoSignatureController);

router.post(
  "/sign-supabase",
  verifyJWTMiddleware,
  getSupabaseSignedUrlController,
);

router.post(
  "/confirm-attachment",
  verifyJWTMiddleware,
  confirmAttachmentValidator,
  validateExpress,
  confirmAttachmentController,
);


// group chat image
router.post(
  "/group-chat-image/:chatId",
  verifyJWTMiddleware,
  uploadImage.single("groupChatImage"),
  addGroupChatImageController,
);

router.delete(
  "/group-chat-image/:chatId",
  verifyJWTMiddleware,
  deleteChatImageController,
);


export default router;
