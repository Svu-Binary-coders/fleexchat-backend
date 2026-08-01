import { supabase } from "../config/supabase.config.js";
import { SALT_ROUNDS } from "../const/auth.const.js";
import ServiceError from "../helper/servicesError.helper.js";
import bcrypt from "bcrypt";

/**
 * Resets the password for a user with the given email address.
 * @param email User email address for which the password needs to be reset
 * @param newPassword New password to be set for the user
 * @throws ServiceError if the user is not found or if there is an error updating the password
 */
export const resetPasswordService = async (
  email: string,
  newPassword: string,
) => {
  const { data: user, error } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (!user) {
    throw new ServiceError("User not found", 404);
  }
  if (error) {
    throw new ServiceError("Error fetching user details", 500);
  }
  const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
  const { data: updatedUser, error: updateError } = await supabase
    .from("users")
    .update({ password: hashedPassword })
    .eq("email", email)
    .maybeSingle();

  if (!updatedUser) {
    throw new ServiceError("User not found", 404);
  }

  if (updateError) {
    throw new ServiceError("Error updating password", 500);
  }
};

/**
 * Changes the password for a user with the given user ID.
 * @param userId User UUID for which the password needs to be changed
 * @param currentPassword Current password of the user
 * @param newPassword New password to be set for the user
 * @throws ServiceError if the user is not found, the current password is incorrect, or if there is an error updating the password
 */
export const changePasswordService = async (
  userId: string,
  currentPassword: string,
  newPassword: string,
) => {
  const { data: user, error } = await supabase
    .from("users")
    .select("id, password")
    .eq("id", userId)
    .maybeSingle();

  if (!user) {
    throw new ServiceError("User not found", 404);
  }

  // Check if the current password matches the stored password
  const isPasswordMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isPasswordMatch) {
    throw new ServiceError("Current password is incorrect", 403);
  }

  // Hash the new password
  const hashedNewPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

  const { error: updateError } = await supabase
    .from("users")
    .update({ password: hashedNewPassword })
    .eq("id", userId)
    .maybeSingle();

  if (!updateError) {
    throw new ServiceError("Error updating password", 500);
  }
};
