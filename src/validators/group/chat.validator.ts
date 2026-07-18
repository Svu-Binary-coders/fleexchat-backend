import { body, ValidationChain } from "express-validator";
import mongoose from "mongoose";
export const groupNameValidation: ValidationChain = body("groupName")
  .isString()
  .withMessage("Group name must be a string")
  .isLength({ min: 3, max: 100 })
  .withMessage("Group name must be between 3 and 100 characters");

export const groupDescriptionValidation: ValidationChain = body(
  "groupDescription",
)
  .optional()
  .isString()
  .withMessage("Group description must be a string")
  .isLength({ max: 500 })
  .withMessage("Group description can be up to 500 characters long");

export const participantIdsValidation: ValidationChain = body("participantIds")
  .isArray({ min: 1 })
  .withMessage("Participant IDs must be an array with at least one ID")
  .custom((value) => {
    for (const id of value) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error(`Invalid participant ID`);
      }
    }
    return true;
  });

export const groupSettingsValidation: ValidationChain = body("groupSettings")
  .optional()
  .isObject()
  .withMessage("Group settings must be an object")
  .custom((value) => {
    const allowedSettings = [
      "isAdminOnlyMessaging",
      "isAdminInvitationsAllowed",
      "inviteViaURL",
      "canEditGroupInfo",
    ];
    for (const key of Object.keys(value)) {
      if (!allowedSettings.includes(key)) {
        throw new Error(`Invalid group setting: ${key}`);
      }

      if (typeof value[key] !== "string" && typeof value[key] !== "boolean" && value[key] !== "true" && value[key] !== "false" ) {
        throw new Error(`Group setting ${key} must be a boolean or string value`);
      }
    }
    return true;
  });

export const participantsIdsValidation: ValidationChain = body("participantIds")
  .isArray({ min: 1, max: 20 })
  .withMessage("Participant IDs must be an array with at least one ID and no more than 20 IDs")
  .custom((value) => {
    for (const id of value) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error(`Invalid participant ID`);
      }
    }
    return true;
  });