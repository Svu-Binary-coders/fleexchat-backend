import dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";
import ServiceError from "../helper/servicesError.helper.js";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new ServiceError(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables",
    500,
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
