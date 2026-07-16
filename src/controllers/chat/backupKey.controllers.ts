import { Request, Response, NextFunction } from "express";
import {
  createBackupKey,
  getPublicKeyForUser,
} from "../../services/chat/backupKey.services.js";

export const saveBackupKey = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { userId, publicKey64, saltB64, encBackupKey, identityBackup } =
      req.body;
    if (
      !userId ||
      !publicKey64 ||
      !saltB64 ||
      !encBackupKey ||
      !identityBackup
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }
    await createBackupKey(
      userId,
      publicKey64,
      saltB64,
      encBackupKey,
      identityBackup,
    );

    return res
      .status(200)
      .json({ success: true, message: "E2E Keys backed up securely" });
  } catch (error) {
    next(error);
  }
};

