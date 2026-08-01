import redis from "../config/redis.config.js";
import { supabase } from "../config/supabase.config.js";
import {
  UserAccountStatus,
  UserActivityStatusType,
} from "../enums/auth.enums.js";
import { getLocation, getDeviceInfo } from "../helper/getLocation.helper.js";
import ServiceError from "../helper/servicesError.helper.js";
import bcrypt from "bcrypt";
import { isActionVerified } from "../redis/otp.redis.js";
import { generateCustomId } from "../helper/genarateSortId.helper.js";
import { SALT_ROUNDS } from "../const/auth.const.js";

/**
 * Checks if a user ID is available
 * @param userId - The user ID to check for availability (Transfer ID)
 * @returns A promise that resolves to true if the user ID is available, false otherwise
 * @throws ServiceError if there is an error checking the user ID availability
 */
export const getUserIdAvailable = async (userId: string): Promise<boolean> => {
  const cached = await redis.exists(`userId:${userId}`);
  if (cached) {
    return false;
  }

  const { data, error } = await supabase
    .from("users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Error checking user ID availability:", error.message);
    throw new ServiceError("Error checking user ID availability", 500);
  }

  if (data) {
    await redis.set(`userId:${userId}`, "exists", "EX", 24 * 3600); // Cache for 1 day
  }

  return !data;
};

/**
 *
 * @param searchTerm `userName`,`userId` or `email` to search for users
 * @returns A promise that resolves to an array of user objects containing id, userId, name, profileImage, and similarityScore
 * @throws ServiceError if there is an error searching for users
 */
export const searchUsersService = async (
  searchTerm: string,
): Promise<
  {
    id: string;
    userId: string;
    name: string;
    profileImage: string | null;
    similarityScore: number;
  }[]
> => {
  const trimmed = searchTerm.trim();
  if (trimmed.length < 2) {
    return [];
  }

  if (trimmed.startsWith("@")) {
    const handleQuery = trimmed.slice(1).trim();

    if (handleQuery.length === 0) return [];

    const { data, error } = await supabase
      .from("users")
      .select("transfer_id,user_id, name, profile_image")
      .ilike("user_id", `${handleQuery}%`)
      .limit(10);
    console.log("Searching users by handle:", handleQuery);
    console.log("Supabase response data:", data);
    if (error) {
      console.error("Error searching users by handle:", error.message);
      throw new ServiceError("Error searching users", 500);
    }

    return (data ?? []).map((u: any) => ({
      id: u.transfer_id,
      userId: u.user_id,
      name: u.name,
      profileImage: u.profile_image,
      similarityScore: 1,
    }));
  }

  const { data, error } = await supabase.rpc("search_users", {
    search_term: trimmed,
    result_limit: 10,
  });

  if (error) {
    console.error("Error searching users:", error.message);
    throw new ServiceError("Error searching users", 500);
  }

  return (data ?? []).map((u: any) => ({
    id: u.transfer_id,
    userId: u.user_id,
    name: u.name,
    profileImage: u.profile_image,
    similarityScore: u.similarity_score,
  }));
};

/**
 * Registers a new user in the system after verifying the OTP and checking for user ID availability.
 * @param name string - The name of the user to be registered.
 * @param email - The email address of the user to be registered.
 * @param password - The password for the user account, which will be hashed before storage.
 * @param userId - The unique user ID (transfer ID) for the new user, which must be available.
 * @param fingerPrintId - The fingerprint ID of the device used for registration, which will be logged for activity tracking.
 * @param ip - The IP address of the device used for registration, which will be logged for activity tracking.
 * @param deviceInfo - An object containing device information, including OS, device type, browser, and device vendor, which will be logged for activity tracking.
 * @returns An object containing the new user's transfer ID, account status, and session ID.
 * @throws ServiceError if the user ID is already taken, the email is not verified, or there is an error during registration.
 */
export const addRegisterService = async (
  name: string,
  email: string,
  password: string,
  userId: string,
  fingerPrintId: string,
  ip: string,
  deviceInfo: {
    os: string;
    DeviceType: string;
    browser: string;
    deviceVendor: string;
  },
) => {
  const isAvailable = await getUserIdAvailable(userId);
  if (!isAvailable) {
    throw new ServiceError("This user ID is already taken", 409);
  }

  // check is otp verified for registration
  const isOTPVerified = await isActionVerified(email, "registration");
  console.log(`OTP verification status for ${email}: ${isOTPVerified}`);
  if (!isOTPVerified) {
    throw new ServiceError("Email is not verified for registration", 403);
  }
  const transferId = generateCustomId(15);

  const { data: existingEmail, error: emailCheckError } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (emailCheckError) {
    throw new ServiceError("Error checking email", 500);
  }
  if (existingEmail) {
    throw new ServiceError("Email is already registered", 409);
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  const { data: newUser, error: insertError } = await supabase
    .from("users")
    .insert({
      user_id: userId,
      name,
      email,
      is_email_verified: true,
      password: hashedPassword,
      transfer_id: transferId,
      account_status: UserAccountStatus.ACTIVE,
    })
    .select("id, user_id,account_status,transfer_id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      throw new ServiceError(
        "User ID or email already taken, please try again",
        409,
      );
    }
    throw new ServiceError("Failed to create user", 500);
  }
  const geo = getLocation(ip);
  const sessionId = generateCustomId(15);
  const { error: activityError } = await supabase
    .from("user_activities")
    .insert({
      user_id: newUser.id,
      login_time: new Date().toISOString(),
      ip_address: ip,
      fingerprint_id: fingerPrintId,
      session_id: sessionId,
      device_info: {
        os: deviceInfo.os,
        deviceType: deviceInfo.DeviceType,
        browser: deviceInfo.browser,
        deviceVendor: deviceInfo.deviceVendor,
      },
      location: geo
        ? {
            country: geo.country,
            city: geo.city,
            latitude: geo.latitude,
            longitude: geo.longitude,
            timezone: geo.timezone,
          }
        : null,
      session_expires_at: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString(), // Session expires in 30 days
      status: UserActivityStatusType.ACTIVE,
    });

  if (activityError) {
    console.error(
      "Failed to log registration activity:",
      activityError.message,
    );
  }

  await redis.set(`userId:${userId}`, "exists", "EX", 24 * 3600); // Cache for 1 day

  const returnedUser = {
    userId: newUser.user_id,
    accountStatus: newUser.account_status,
    id: newUser.transfer_id,
    sessionId: sessionId,
  };
  return returnedUser;
};

/**
 *
 * @param email - email of the user trying to log in
 * @param password - password of the user trying to log in
 * @param fingerPrintId - fingerprint ID of the device used for login
 * @param ip - IP address of the device used for login
 * @param deviceInfo - object containing device information
 * @returns   An object containing the user's transfer ID, account status, and session ID if login is successful
 * @throws ServiceError if the credentials are invalid, the account is locked or suspended, or there is an error during login
 */
export const loginService = async (
  email: string,
  password: string,
  fingerPrintId: string,
  ip: string,
  deviceInfo: {
    os: string;
    DeviceType: string;
    browser: string;
    deviceVendor: string;
  },
) => {
  const { data: user, error } = await supabase
    .from("users")
    .select(
      "id, user_id, name, email, password, account_status, login_attempts, locked_until, transfer_id",
    )
    .eq("email", email)
    .maybeSingle();

  if (error) throw new ServiceError("Error during login", 500);
  if (!user) throw new ServiceError("Invalid credentials", 401);

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new ServiceError("Account temporarily locked, try again later", 423);
  }
  if (user.account_status == UserAccountStatus.SUSPENDED) {
    throw new ServiceError(
      "Account is suspended. Please contact support.",
      403,
    );
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  const geo = getLocation(ip);

  if (!isPasswordValid) {
    const newAttempts = (user.login_attempts || 0) + 1;
    const shouldLock = newAttempts >= 5;

    await supabase
      .from("users")
      .update({
        login_attempts: newAttempts,
        locked_until: shouldLock
          ? new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString() // lock for 3  hours
          : null,
      })
      .eq("id", user.id);

    throw new ServiceError("Invalid credentials", 401);
  }
  const sessionId = generateCustomId(15);

  await supabase
    .from("users")
    .update({
      login_attempts: 0,
      locked_until: null,
      last_login: new Date().toISOString(),
    })
    .eq("id", user.id);

  // check if the user has an existing session with the same fingerprint
  const { data: existingSession, error: sessionError } = await supabase
    .from("user_activities")
    .select("id, session_id")
    .eq("fingerprint_id", fingerPrintId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (sessionError) {
    console.error("Error checking existing session:", sessionError.message);
  }
  if (existingSession) {
    // update the existing session's login time and other details
    await supabase
      .from("user_activities")
      .update({
        login_time: new Date().toISOString(),
        ip_address: ip,
        device_info: {
          os: deviceInfo.os,
          deviceType: deviceInfo.DeviceType,
          browser: deviceInfo.browser,
          deviceVendor: deviceInfo.deviceVendor,
        },
        location: geo
          ? {
              country: geo.country,
              city: geo.city,
              latitude: geo.latitude,
              longitude: geo.longitude,
              timezone: geo.timezone,
            }
          : null,
        session_expires_at: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      })
      .eq("id", existingSession.id);
  }
  // if no existing session, create a new session
  else {
    const { error: activityError } = await supabase
      .from("user_activities")
      .insert({
        user_id: user.id,
        login_time: new Date().toISOString(),
        ip_address: ip,
        fingerprint_id: fingerPrintId,
        session_id: sessionId,
        device_info: {
          os: deviceInfo.os,
          deviceType: deviceInfo.DeviceType,
          browser: deviceInfo.browser,
          deviceVendor: deviceInfo.deviceVendor,
        },
        location: geo
          ? {
              country: geo.country,
              city: geo.city,
              latitude: geo.latitude,
              longitude: geo.longitude,
              timezone: geo.timezone,
            }
          : null,
        session_expires_at: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        status: UserActivityStatusType.ACTIVE,
      });
    if (activityError) {
      throw new ServiceError("Failed to create user activity session", 500);
    }
  }

  const returnedUser = {
    id: user.id,
    userId: user.transfer_id,
    accountStatus: user.account_status,
    sessionId: existingSession ? existingSession.session_id : sessionId,
  };
  return returnedUser;
};

/**
 * Fetches the details of a user based on their user ID (`UUID ID`).
 * @param id - The user ID of the user whose details are to be fetched
 * @returns - An object containing the user's transfer ID, user ID, name, email, profile image, bio, website, location, creation date, and chat lock status
 * @throws - ServiceError if the user is not found or if there is an error fetching the user details
 */
export const getUserDetailsService = async (id: string) => {
  console.log(`Fetching user details for ID: ${id}`);
  const { data: user, error } = await supabase
    .from("users")
    .select(
      " user_id, name,transfer_id, email, profile_image, bio, website, location, created_at, chat_lock_pin, last_login, last_logout, account_status",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Error fetching user details:", error.message);
    throw new ServiceError("Failed to fetch user details", 500);
  }

  if (!user) {
    throw new ServiceError("User not found", 404);
  }

  return {
    id: user.transfer_id,
    user_id: user.user_id,
    name: user.name,
    email: user.email,
    profile_image: user.profile_image ?? null,
    bio: user.bio ?? null,
    website: user.website ?? null,
    location: user.location ?? null,
    created_at: user.created_at,
    is_chat_lock_enabled: !!user.chat_lock_pin,
  };
};

export type UpdateableFields = {
  name?: string;
  bio?: string;
  website?: string;
  location?: {
    city: string;
    country: string;
    coordinates: {
      latitude: number;
      longitude: number;
    };
  };
};

/**
 * User profile update service that updates the user's profile information in the database.
 * @param userId - The unique identifier (UUID) of the user whose profile is to be updated
 * @param updates - An object containing the fields to be updated and their new values
 * @returns - An object containing the updated profile information
 * @throws - ServiceError if the user is not found or if there is an error updating the profile
 */
export const updateProfileService = async (
  userId: string,
  updates: UpdateableFields,
) => {
  if (Object.keys(updates).length === 0) {
    throw new ServiceError("No fields to update", 400);
  }

  const { data: user, error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", userId)
    .select("user_id, name, profile_image, bio, website, location, created_at")
    .maybeSingle();
  if (error) {
    console.error("Error updating user profile:", error.message);
    throw new ServiceError("Failed to update user profile", 500);
  }
  if (!user) {
    throw new ServiceError("User not found", 404);
  }
  const response: any = {};
  if (updates.name) response.name = user.name;
  if (updates.bio !== undefined) response.bio = user.bio;
  if (updates.website !== undefined) response.website = user.website;
  if (updates.location !== undefined) response.location = user.location;
  return response;
};

/**
 * Logs out a user by updating their session status to inactive and recording the logout time in the database.
 * @param userId - user UUID of the user to be logged out
 * @param sessionId - The ID of the session to be logged out
 */
export const logoutService = async (userId: string, sessionId: string) => {
  const { data, error } = await supabase
    .from("user_activities")
    .update({
      logout_time: new Date().toISOString(),
      status: UserActivityStatusType.INACTIVE,
    })
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new ServiceError("Failed to update user activity session", 500);
  }
  if (!data) {
    throw new ServiceError("Session not found or already logged out", 404);
  }
};

/**
 * Get all active sessions for a user, including the current session.
 * @param userId user UUID of the user whose sessions are to be fetched
 * @param currentSessionId Current session ID of the user, used to mark the current session in the returned data
 * @returns An array of session objects containing session details and a flag indicating if it is the current session
 */
export const getAllSessionsService = async (
  userId: string,
  currentSessionId: string,
) => {
  const { data, error } = await supabase
    .from("user_activities")
    .select(
      "id, session_id, login_time, ip_address, fingerprint_id, device_info, location, status, session_expires_at",
    )
    .eq("user_id", userId)
    .eq("status", UserActivityStatusType.ACTIVE)
    .order("login_time", { ascending: false });
  if (error) {
    throw new ServiceError("Failed to fetch user sessions", 500);
  }

  if (!data || data.length === 0) {
    throw new ServiceError("No sessions found for this user", 404);
  }

  const sessionsWithCurrentFlag = data.map((session) => ({
    ...session,
    isCurrentSession: session.session_id === currentSessionId,
  }));

  return sessionsWithCurrentFlag;
};

/**
 * User logout service that logs out all sessions for a user except the current session.
 * @param userId User UUID of the user whose sessions are to be logged out
 * @param currentSessionId Current session ID of the user, which will not be logged out
 * @throws ServiceError if there is an error logging out other sessions or if no other sessions are found
 */
export const logoutAllSessionsService = async (
  userId: string,
  currentSessionId: string,
) => {
  const { data, error } = await supabase
    .from("user_activities")
    .update({
      logout_time: new Date().toISOString(),
      status: UserActivityStatusType.INACTIVE,
    })
    .eq("user_id", userId)
    .neq("session_id", currentSessionId)
    .select("id");
  console.log(
    `Logging out all sessions for user: ${userId}, excluding session: ${currentSessionId}`,
  );

  if (error) {
    throw new ServiceError("Failed to logout other sessions", 500);
  }
  if (!data || data.length === 0) {
    throw new ServiceError("No other sessions found to logout", 404);
  }
};

/**
 * Logs out a specific session for a user.
 * @param userId User UUID of the user whose session is to be logged out
 * @param sessionId The ID of the session to be logged out
 * @throws ServiceError if the session is not found or if there is an error logging out the session
 */
export const logoutSpecificSessionService = async (
  userId: string,
  sessionId: string,
) => {
  const { data, error } = await supabase
    .from("user_activities")
    .update({
      logout_time: new Date().toISOString(),
      status: UserActivityStatusType.INACTIVE,
    })
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .select("id")
    .maybeSingle();
  console.log(`Logging out specific session: ${sessionId} for user: ${userId}`);
  if (error) {
    throw new ServiceError("Failed to logout the specific session", 500);
  }
  if (!data) {
    throw new ServiceError("Session not found or already logged out", 404);
  }
};

/**
 * See other user's profile by their transfer ID.
 * @param userId user transfer ID of the user whose profile is to be fetched
 * @returns An object containing the user's transfer ID, user ID, name, email, profile image, bio, website, location, creation date, and account status
 */
export const getOthersUsersProfileService = async (userId: string) => {
  const { data: user, error } = await supabase
    .from("users")
    .select(
      " user_id, name,transfer_id, email, profile_image, bio, website, location, created_at,account_status",
    )
    .eq("transfer_id", userId)
    .maybeSingle();

  console.log(`Fetching users profile: ${user}`);

  if (!user) {
    throw new ServiceError("User not found", 404);
  }
  if (error) {
    throw new ServiceError("Failed to fetch user details", 500);
  }
  if (user.account_status == UserAccountStatus.SUSPENDED) {
    throw new ServiceError(
      "Account is suspended. Please contact support.",
      403,
    );
  }
  return {
    id: user.transfer_id,
    user_id: user.user_id,
    name: user.name,
    email: user.email,
    profile_image: user.profile_image ?? null,
    bio: user.bio ?? null,
    website: user.website ?? null,
    location: user.location ?? null,
    created_at: user.created_at,
    account_status: user.account_status,
  };
};
