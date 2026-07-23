import { Router } from "express";
import {
  addGlobalChatLockPasswordController,
  changeChatLockPinController,
  createChatLockController,
  createNewChatRoom,
  getAllChatMessages,
  getContacts,
  getLinkPreview,
  getUserProfile,
  searchUserNameController,
  toggleFavoriteChatController,
  togglePinChatController,
  unlockChatController,
  verifyChatLockPinController,
  viewOthersUserProfile,
} from "../controllers/chat/user.chat.controllers.js";
import { verifyJWTMiddleware } from "../middleware/auth/jwtValidate.middleware.js";
import {
  chatLockPinValidator,
  customChatIdValidetor,
} from "../validators/chat.validetor.js";
import { validateExpress } from "../validators/validateExpress.validetor.js";
import { getAttachmentsForChatController } from "../controllers/chat/attachment.controllers.js";

const router = Router();

router.get("/contacts", verifyJWTMiddleware, getContacts);
router.post("/create", verifyJWTMiddleware, createNewChatRoom);
router.get("/search", verifyJWTMiddleware, searchUserNameController);
router.get("/link-preview", verifyJWTMiddleware, getLinkPreview);

router.put(
  "/add-lock-password",
  verifyJWTMiddleware,
  chatLockPinValidator,
  validateExpress,
  addGlobalChatLockPasswordController,
);

router.put(
  "/verify-pin",
  verifyJWTMiddleware,
  validateExpress,
  verifyChatLockPinController,
);

router.patch(
  "/change-pin",
  verifyJWTMiddleware,
  chatLockPinValidator,
  validateExpress,
  changeChatLockPinController,
);

router.get("/user/:userId", verifyJWTMiddleware, getUserProfile);
router.get("/viewDetails/:userId", verifyJWTMiddleware, viewOthersUserProfile);

router.post(
  "/toggle-pin/:customChatId",
  verifyJWTMiddleware,
  togglePinChatController,
);

router.post(
  "/toggle-favorite/:customChatId",
  verifyJWTMiddleware,
  toggleFavoriteChatController,
);

router.post(
  "/lock/:customChatId",
  verifyJWTMiddleware,
  customChatIdValidetor,
  validateExpress,
  createChatLockController,
);

router.patch(
  "/unlock/:customChatId",
  verifyJWTMiddleware,
  customChatIdValidetor,
  validateExpress,
  unlockChatController,
);


router.get(
  "/:chatId/attachments",
  verifyJWTMiddleware,
  getAttachmentsForChatController,
);

router.get(
  "/:roomId/:receiverId",
  verifyJWTMiddleware,
  getAllChatMessages,
);

export default router;