import { Router } from "express";
const router = Router();
import { verifyJWTMiddleware } from "../../middleware/auth/jwtValidate.middleware.js";
import {
  groupDescriptionValidation,
  groupNameValidation,
  groupSettingsValidation,
  participantsIdsValidation,
} from "../../validators/group/chat.validator.js";
import {
  addParticipantsToGroupChat,
  createGroupChat,
  getAllGroupParticipants,
  getGroupChatDetails,
  removeParticipantFromGroupChat,
} from "../../controllers/group/chat.controllers.js";
import {
  getSenderKeysController,
  saveSenderKeyController,
} from "../../controllers/group/senderKey.controllers.js";
router.post(
  "/create",
  verifyJWTMiddleware,
  groupNameValidation,
  groupDescriptionValidation,
  groupSettingsValidation,
  participantsIdsValidation,
  verifyJWTMiddleware,
  createGroupChat,
);

router.get("/:chatId/chat-details", verifyJWTMiddleware, getGroupChatDetails);
router.delete(
  "/:chatId/remove-participants",
  verifyJWTMiddleware,
  participantsIdsValidation,
  verifyJWTMiddleware,
  removeParticipantFromGroupChat,
);

router.post(
  "/:chatId/add-participants",
  verifyJWTMiddleware,
  participantsIdsValidation,
  verifyJWTMiddleware,
  addParticipantsToGroupChat,
);
router.get(
  "/:chatId/participants",
  verifyJWTMiddleware,
  verifyJWTMiddleware,
  getAllGroupParticipants,
);

// key management
router.post(
  "/:chatId/sender-key",
  verifyJWTMiddleware,
  saveSenderKeyController,
);
router.get(
  "/:chatId/sender-keys",
  verifyJWTMiddleware,
  getSenderKeysController,
);

export default router;
