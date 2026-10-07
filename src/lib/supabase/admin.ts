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

  if (!serviceRoleKey || serviceRoleKey.includes('placeholder')) {
    console.error('[CRITICAL] Missing or placeholder SUPABASE_SERVICE_ROLE_KEY environment variable. Privileged operations cannot proceed.');
    throw new Error('Server configuration error: Supabase Service Role Key is not configured.');
  }

  if (!adminClient) {
    adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  return adminClient;
}
