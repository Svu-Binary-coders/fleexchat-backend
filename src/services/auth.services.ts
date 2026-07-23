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
import { UUID } from "crypto";
import { SALT_ROUNDS } from "../const/auth.const.js";

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

  if (error) {
    throw new ServiceError("Failed to logout other sessions", 500);
  }
  if (!data || data.length === 0) {
    throw new ServiceError("No other sessions found to logout", 404);
  }
};

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

  if (error) {
    throw new ServiceError("Failed to logout the specific session", 500);
  }
  if (!data) {
    throw new ServiceError("Session not found or already logged out", 404);
  }
};

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
