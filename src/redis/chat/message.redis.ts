import redis from "../../config/redis.config.js";
import { supabase } from "../../config/supabase.config.js";

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;

export const getOtherParticipant = async (
  chatRoomId: string,
  participantId: string,
): Promise<string | null> => {
  const cacheKey = `chat:${chatRoomId}:other:${participantId}`;

  // Redis check
  const cached = await redis.get(cacheKey);
  if (cached) return cached;

  const { data: chat, error: chatError } = await supabase
    .from("chats")
    .select("id")
    .eq("custom_chat_id", chatRoomId)
    .maybeSingle();

  if (chatError || !chat) return null;
  const { data: otherParticipant, error: participantError } = await supabase
    .from("chat_participants")
    .select("user_id")
    .eq("chat_id", chat.id)
    .neq("user_id", participantId)
    .maybeSingle();

  if (participantError || !otherParticipant) return null;

  const otherId = otherParticipant.user_id;
  await redis.set(cacheKey, otherId, "EX", CACHE_TTL_SECONDS);

  return otherId;
};
