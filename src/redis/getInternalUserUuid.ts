import redis from "../config/redis.config.js";
import { supabase } from "../config/supabase.config.js";
import ServiceError from "../helper/servicesError.helper.js";

export const getInternalUuid = async (
  externalUserId: string,
): Promise<string> => {
  const cacheKey = `user:uuid-mapping:${externalUserId}`;

  try {
    const cachedUuid = await redis.get(cacheKey);

    if (cachedUuid) {
      return cachedUuid;
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("id")
      .eq("transfer_id", externalUserId)
      .single();

    if (error || !user?.id) {
      throw new ServiceError("User not found", 404);
    }

    const internalUuid = user.id;
    await redis.set(cacheKey, internalUuid, "EX", 86400);

    return internalUuid;
  } catch (error) {
    if (error instanceof ServiceError) {
      throw error;
    }
    throw new ServiceError("some error occurred", 500);
  }
};
