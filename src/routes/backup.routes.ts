import { Router } from "express";
import { saveBackupKey } from "../controllers/chat/backupKey.controllers.js";
const router = Router();


router.post("/create", saveBackupKey);

export default router;