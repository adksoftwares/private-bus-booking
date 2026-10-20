import { HttpError } from '@/lib/auth-server';

interface RateLimitRecord { count: number; resetAt: number }
const localStore = new Map<string, RateLimitRecord>();
const legacyStore = new Map<string, RateLimitRecord>();

function getClientIp(req: Request): string {
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp.slice(0, 128);
  if (process.env.TRUST_PROXY_HEADERS === 'true') {
    const forwarded = req.headers.get('x-forwarded-for');
    const first = forwarded?.split(',')[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  return 'unknown';
}

function localLimit(store: Map<string, RateLimitRecord>, key: string, max: number, windowSeconds: number) {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, resetSeconds: windowSeconds };
  }
  if (entry.count >= max) return { allowed: false, resetSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  entry.count += 1;
  return { allowed: true, resetSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
}

/**
 * Legacy synchronous process-local limiter retained for existing PayHere routes.
 * Do not use for new production API handlers.
 */
export function enforceRateLimit(req: Request, action: string, maxRequests = 30, windowSeconds = 60): void {
  const result = localLimit(legacyStore, `${action}:${getClientIp(req)}`, maxRequests, windowSeconds);
  if (!result.allowed) {
    throw new HttpError(429, `Too many requests. Please wait ${result.resetSeconds} seconds before trying again.`);
  }
}

async function sharedLimit(key: string, max: number, windowSeconds: number) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (process.env.NODE_ENV === 'production') {
      throw new HttpError(503, 'Rate limiting is not configured. Please try again later.');
    }
    return localLimit(localStore, key, max, windowSeconds);
  }

  const script = "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; return {count, redis.call('PTTL', KEYS[1])}";
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['EVAL', script, '1', `rate-limit:${key}`, String(windowSeconds * 1000)]),
      cache: 'no-store'
    });
  } catch {
    throw new HttpError(503, 'Rate limiting service is temporarily unavailable.');
  }
  if (!response.ok) throw new HttpError(503, 'Rate limiting service is temporarily unavailable.');

  const payload = await response.json() as { result?: unknown; error?: string };
  if (payload.error || !Array.isArray(payload.result) || payload.result.length < 2) {
    throw new HttpError(503, 'Rate limiting service returned an invalid response.');
  }
  const count = Number(payload.result[0]);
  const ttl = Number(payload.result[1]);
  if (!Number.isFinite(count) || !Number.isFinite(ttl)) {
    throw new HttpError(503, 'Rate limiting service returned an invalid response.');
  }
  return { allowed: count <= max, resetSeconds: Math.max(1, Math.ceil(ttl / 1000)) };
}

/** Shared, atomic rate limiting for non-PayHere production API handlers. */
export async function enforceSharedRateLimit(req: Request, action: string, maxRequests = 30, windowSeconds = 60): Promise<void> {
  const key = `${action}:${getClientIp(req)}`;
  const result = await sharedLimit(key, maxRequests, windowSeconds);
  if (!result.allowed) {
    throw new HttpError(429, `Too many requests. Please wait ${result.resetSeconds} seconds before trying again.`);
  }
}
