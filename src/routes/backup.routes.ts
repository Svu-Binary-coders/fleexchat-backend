import { Router } from "express";
import {
  saveBackupKey,
  updateBackupKeyController,
  getRecoveryDataController,
} from "../controllers/chat/backupKey.controllers.js";

const router = Router();

router.post("/create", saveBackupKey);
router.get("/:userId/get-key", getRecoveryDataController);
router.post("/:userId/update-key", updateBackupKeyController);

export default router;
