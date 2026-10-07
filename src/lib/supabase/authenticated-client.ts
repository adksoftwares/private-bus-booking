import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { Database } from '@/types/database';

/**
 * Returns an authoritative Supabase client for handling backend requests.
 * Prefers the Admin Client (service_role) when available.
 * If the service_role key is unconfigured or a placeholder, it gracefully falls back
 * to a client authenticated with the user's incoming Bearer token, which operates safely under Row Level Security.
 */
export function getAuthenticatedRequestClient(req?: Request) {
  try {
    return getSupabaseAdminClient();
  } catch {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    let bearerToken = '';
    if (req) {
      const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        bearerToken = authHeader.substring(7).trim();
      }
    }

    return createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: bearerToken ? { headers: { Authorization: `Bearer ${bearerToken}` } } : undefined
    });
  }
}
