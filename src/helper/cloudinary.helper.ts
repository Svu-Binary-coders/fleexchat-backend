import { Readable } from "stream";
import cloudinary from "../config/cloudinary.config.js";
import ServiceError from "./servicesError.helper.js";

export const getFileMetadata = (file: Express.Multer.File) => {
  if (file.mimetype.startsWith("image/"))
    return {
      type: "image",
      folder: "flex-chat/images",
      resourceType: "image" as const,
    };

  throw new ServiceError("Unsupported file type for server upload", 400);
};

// Image upload — server stream
export const uploadToCloudinary = async (
  file: Express.Multer.File,
  folder: string,
  resourceType: "image" | "video" = "image",
): Promise<{ url: string; publicId: string }> => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (error, result) => {
        if (error) reject(error);
        else resolve({ url: result!.secure_url, publicId: result!.public_id });
      },
    );
    Readable.from(file.buffer).pipe(stream);
  });
};

export const generateVideoSignature = (fileSize: number, fileName: string) => {
  const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
  if (fileSize > MAX_VIDEO_SIZE) {
    throw new ServiceError("Video too large. Max: 50MB", 400);
  }

  const timestamp = Math.round(Date.now() / 1000);
  const folder = "flex-chat/videos";

  const paramsToSign = {
    timestamp,
    folder,
  };

  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    process.env.CLOUDINARY_API_SECRET!,
  );

  return {
    signature,
    timestamp,
    folder,
    apiKey: process.env.CLOUDINARY_API_KEY!,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
  };
};

export const deleteFromCloudinary = async (
  publicId: string,
  resourceType: "image" | "video" = "image",
) => {
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
};
