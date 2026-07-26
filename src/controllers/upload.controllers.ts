import { Request, Response, NextFunction } from "express";
import {
  updateProfilePictureService,
  deleteProfilePictureService,
  getSupabaseSignedUrlService,
  addGroupChatImageService,
  deleteChatImageService,
  getMediaSignatureService,
} from "../services/upload.services.js";
import ServiceError from "../helper/servicesError.helper.js";

// ===============================================
// 1. User Profile Picture Controllers
// ===============================================
export const updateAvatarController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { url, publicId } = req.body;
    if (!url || !publicId) {
      throw new ServiceError("url and publicId are required", 400);
    }

    const userId = String(res.locals.user.userId);

    const result = await updateProfilePictureService(userId, url, publicId);

    res.status(200).json({
      success: true,
      message: "Profile picture updated successfully",
      profilePicture: result.url,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteAvatarController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = String(res.locals.user.userId);
    await deleteProfilePictureService(userId);

    res.status(200).json({
      success: true,
      message: "Profile picture deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

// ===============================================
// 2. Group Chat Image Controllers
// ===============================================
export const addGroupChatImageController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { url, publicId } = req.body;
    const chatIdParam = req.params.chatId;

    if (!chatIdParam || Array.isArray(chatIdParam)) {
      throw new ServiceError("chatId is required", 400);
    }
    if (!url || !publicId) {
      throw new ServiceError("url and publicId are required", 400);
    }

    const result = await addGroupChatImageService(chatIdParam, url, publicId);

    res.status(200).json({
      success: true,
      url: result.url,
      publicId: result.publicId,
      type: "image",
    });
  } catch (error) {
    next(error);
  }
};

export const deleteChatImageController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const chatIdParam = req.params.chatId;
    if (!chatIdParam || Array.isArray(chatIdParam)) {
      throw new ServiceError("chatId is required", 400);
    }

    await deleteChatImageService(chatIdParam);

    res.status(200).json({
      success: true,
      message: "Group chat image deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

// ===============================================
// 3. Dynamic Cloudinary Signature Controller
// ===============================================
export const getMediaSignatureController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { fileSize, fileName, uploadType } = req.body;

    if (!fileSize || !fileName || !uploadType) {
      throw new ServiceError(
        "fileSize, fileName, and uploadType are required",
        400,
      );
    }

    const signData = getMediaSignatureService(
      Number(fileSize),
      fileName,
      uploadType,
    );

    res.status(200).json({ success: true, ...signData });
  } catch (error) {
    next(error);
  }
};

// ===============================================
// 4. Supabase URL Signatures
// ===============================================
export const getSupabaseSignedUrlController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { fileName, fileType, fileSize } = req.body;

    if (!fileName || !fileType || !fileSize) {
      throw new ServiceError(
        "fileName, fileType, and fileSize are required",
        400,
      );
    }

    if (!["audio", "file"].includes(fileType)) {
      throw new ServiceError("fileType must be 'audio' or 'file'", 400);
    }

    const result = await getSupabaseSignedUrlService(
      fileName,
      fileType as "audio" | "file",
      Number(fileSize),
    );

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

// ===============================================
// 5. Generic Upload Confirmation (Chat Media)
// ===============================================
export const confirmUploadController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { url, publicId, path, type, name, size, mimeType } = req.body;

    if (!url || !type) {
      throw new ServiceError("url and type are required", 400);
    }

    if (!["image", "video", "audio", "file"].includes(type)) {
      throw new ServiceError("Invalid media type", 400);
    }

    // Cloudinary Validation
    if (["video", "image"].includes(type) && !publicId) {
      throw new ServiceError(
        `publicId is required for ${type} (Cloudinary)`,
        400,
      );
    }

    // Supabase Validation
    if (["audio", "file"].includes(type) && !path) {
      throw new ServiceError(`path is required for ${type} (Supabase)`, 400);
    }

    res.status(200).json({
      success: true,
      attachment: {
        url,
        publicId: publicId ?? null,
        path: path ?? null,
        type,
        name,
        size,
        mimeType,
      },
    });
  } catch (error) {
    next(error);
  }
};
