import { Router } from "express";
import {
  addGlobalChatLockPasswordController,
  changeChatLockPinController,
  createChatLockController,
  createNewChatRoom,
  getAllChatMessages,
  getContacts,
  getLinkPreview,
  getUserDetalis,
  getUserProfile,
  searchUserNameController,
  toggleFavoriteChatController,
  togglePinChatController,
  unlockChatController,
  verifyChatLockPinController,
  viewUserProfile,
} from "../controllers/chat/user.chat.controllers.js";
import { verifyJWTMiddleware } from "../middleware/auth/jwtValidate.middleware.js";
import {
  chatLockPinValidator,
  customChatIdValidetor,
} from "../validators/chat.validetor.js";
import { validateExpress } from "../validators/validateExpress.validetor.js";
import { getAttachmentsForChatController } from "../controllers/chat/attachment.controllers.js";
const router = Router();

// load all chat messages
router.get("/:userId/:roomId/:receiverId", getAllChatMessages);
router.get("/:userId/contacts", getContacts);

router.post("/create", createNewChatRoom);

// user profile related routes
router.get("/user/:userId", verifyJWTMiddleware, getUserProfile);
router.get("/search", verifyJWTMiddleware, searchUserNameController);
router.get("/viewDetails/:userId", verifyJWTMiddleware, viewUserProfile);

// link preview route
router.get("/link-preview", verifyJWTMiddleware, getLinkPreview);

// chat actions
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

// chat lock routes
router.put(
  "/add-lock-password",
  verifyJWTMiddleware,
  chatLockPinValidator,
  validateExpress,
  addGlobalChatLockPasswordController,
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

router.put(
  "/verify-pin",
  verifyJWTMiddleware,
  validateExpress,
  verifyChatLockPinController,
);

router.get(
  "/:chatId/attachments",
  verifyJWTMiddleware,
  getAttachmentsForChatController,
);

router.patch(
  "/change-pin",
  verifyJWTMiddleware,
  chatLockPinValidator,
  validateExpress,
  changeChatLockPinController,
);
export default router;
