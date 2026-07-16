import { supabase } from "../config/supabase.config.js";
import { SALT_ROUNDS } from "../const/auth.const.js";
import ServiceError from "../helper/servicesError.helper.js";
import bcrypt from "bcrypt";

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
