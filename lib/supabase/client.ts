import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./env";

/** Supabase client for Client Components. Shares the session cookies with the server. */
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
