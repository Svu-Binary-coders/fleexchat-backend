import cloudinary from "../config/cloudinary.config.js";
import ServiceError from "./servicesError.helper.js";
import { MediaTypeEnums } from "../enums/cloud.enums.js";

/**
 * Generates a signature for uploading media to Cloudinary
 * @param fileSize - size of the file in bytes
 * @param fileName - name of the file
 * @param uploadType - type of the media being uploaded
 * @returns an object containing the signature and other required parameters for Cloudinary upload
 * @see https://cloudinary.com/documentation/image_upload_api_reference#upload_method
 */
export const generateMediaSignature = (
  fileSize: number,
  fileName: string,
  uploadType: (typeof MediaTypeEnums)[keyof typeof MediaTypeEnums],
) => {
  const MAX_SIZE =
    uploadType === MediaTypeEnums.CHAT_VIDEO
      ? 50 * 1024 * 1024
      : 5 * 1024 * 1024;

  if (fileSize > MAX_SIZE) {
    throw new ServiceError(
      `File too large. Max: ${MAX_SIZE / (1024 * 1024)}MB`,
      400,
    );
  }

  let folder = "flex-chat/others";
  if (uploadType === MediaTypeEnums.CHAT_IMAGE) folder = "flex-chat/images";
  else if (uploadType === MediaTypeEnums.CHAT_VIDEO)
    folder = "flex-chat/videos";
  else if (uploadType === MediaTypeEnums.AVATAR) folder = "flex-chat/avatars";
  else if (uploadType === MediaTypeEnums.GROUP_AVATAR)
    folder = "flex-chat/group-avatars";

  const timestamp = Math.round(Date.now() / 1000);

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

/**
 * Deletes a media file from Cloudinary
 * @param publicId - the public ID of the media file to be deleted
 * @param resourceType - the type of the media file, either "image" or "video"
 * @returns - the result of the deletion operation
 * @see https://cloudinary.com/documentation/image_upload_api_reference#destroy_method
 */
export const deleteFromCloudinary = async (
  publicId: string,
  resourceType: "image" | "video" = "image",
) => {
  try {
    console.log(
      `DEBUG: Deleting from Cloudinary... PublicID: ${publicId}, Type: ${resourceType}`,
    );

    const result = await Promise.race([
      cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
      }),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Cloudinary delete timed out")),
          30000, // 30 seconds timeout
        ),
      ),
    ]);

    console.log("DEBUG: Cloudinary Delete Result:", result);
    return result;
  } catch (error) {
    console.error("DEBUG: Cloudinary Delete Error:", error);
    throw error;
  }
};
