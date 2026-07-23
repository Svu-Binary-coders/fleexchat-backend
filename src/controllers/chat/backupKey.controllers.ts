import { Request, Response, NextFunction } from "express";
import {
  createBackupKey,
  getBackupData,
  updateBackupKeyServics,
} from "../../services/chat/backupKey.services.js";
import { getInternalUuid } from "../../redis/getInternalUserUuid.js";

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

export const getRecoveryDataController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { userId } = req.params as { userId: string };
    const getuserUUId = await getInternalUuid(userId);
    const backupData = await getBackupData(getuserUUId);
    if (!backupData) {
      return res
        .status(404)
        .json({ error: "No backup data found for the user" });
    }
    return res.status(200).json({
      publicKey64: backupData.publicKey64,
      saltB64: backupData.saltB64,
      encBackupKey: {
        ctB64: backupData.encBackupKey?.ctB64,
        ivB64: backupData.encBackupKey?.ivB64,
      },
      isMFAEnabled: backupData.isMFAEnabled,
      identityBackup: {
        encPrivKeyB64: backupData.identityBackup?.encPrivKeyB64,
        privKeyIvB64: backupData.identityBackup?.privKeyIvB64,
        sigKeyB64: backupData.identityBackup?.sigKeyB64,
        sigKeyIvB64: backupData.identityBackup?.sigKeyIvB64,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const updateBackupKeyController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { userId } = req.params as { userId: string };
    const { encBackupKey, saltB64 } = req.body;

    const getuserUUId = await getInternalUuid(userId);

    if (!encBackupKey?.ctB64 || !encBackupKey?.ivB64 || !saltB64) {
      return res.status(400).json({ error: "Missing encBackupKey or saltB64" });
    }

    await updateBackupKeyServics(getuserUUId, encBackupKey, saltB64);
    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};
