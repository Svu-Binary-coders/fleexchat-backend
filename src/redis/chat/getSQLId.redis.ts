import redis from "../../config/redis.config.js";
import { supabase } from "../../config/supabase.config.js";

export const getChatSQLId = async (chatId: string): Promise<string | null> => {
  const cacheKey = `chat_sql_id:${chatId}`;

  try {
    const cachedId = await redis.get(cacheKey);
    if (cachedId) {
      return cachedId;
    }

    const { data, error } = await supabase
      .from("chats")
      .select("id")
      .eq("custom_chat_id", chatId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching chat SQL ID:", error);
      return null;
    }

    if (data?.id) {
      await redis.setex(cacheKey, 7 * 24 * 60 * 60, data.id);
      return data.id;
    }

    return null;
  } catch (error) {
    console.error("Cache/DB error in getChatSQLId:", error);
    return null;
  }
};
