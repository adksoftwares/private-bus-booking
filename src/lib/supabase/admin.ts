import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/database';

let adminClient: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Creates or retrieves the authoritative server-only Supabase Admin client.
 * Uses SUPABASE_SERVICE_ROLE_KEY with NO insecure fallbacks to anon keys or dummy values.
 */
export function getSupabaseAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('Security Violation: Supabase Admin Client must never execute in the browser.');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    console.error('[CRITICAL] Missing NEXT_PUBLIC_SUPABASE_URL environment variable.');
    throw new Error('Server configuration error: Supabase URL is not configured.');
  }

  const hasServiceRoleKey = Boolean(serviceRoleKey && !serviceRoleKey.includes('placeholder'));
  const effectiveKey = hasServiceRoleKey ? serviceRoleKey! : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!effectiveKey) {
    console.error('[CRITICAL] Missing Supabase API key (service role key or anon key).');
    throw new Error('Server configuration error: No Supabase API key is configured.');
  }

  if (!adminClient) {
    adminClient = createClient<Database>(supabaseUrl, effectiveKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  return adminClient;
}
