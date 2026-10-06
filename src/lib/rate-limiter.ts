import { HttpError } from '@/lib/auth-server';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

// Periodic cleanup of stale memory records every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
      if (record.resetAt <= now) {
        rateLimitStore.delete(key);
      }
    }
  }, 5 * 60 * 1000).unref?.();
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip') || '127.0.0.1';
}

/**
 * In-memory sliding window rate limiter designed for edge / node servers.
 * @param key Unique rate limiting key (e.g. `lookup:${ip}`)
 * @param maxRequests Maximum allowed requests in the window
 * @param windowSeconds Window length in seconds
 */
export function rateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): { allowed: boolean; remaining: number; resetSeconds: number } {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const existing = rateLimitStore.get(key);

  if (!existing || existing.resetAt <= now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs
    });
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetSeconds: windowSeconds
    };
  }

  if (existing.count >= maxRequests) {
    const resetSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      resetSeconds
    };
  }

  existing.count += 1;
  const resetSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  return {
    allowed: true,
    remaining: maxRequests - existing.count,
    resetSeconds
  };
}

/**
 * Throws HttpError(429) if client exceeds rate limit.
 */
export function enforceRateLimit(
  req: Request,
  action: string,
  maxRequests = 30,
  windowSeconds = 60
): void {
  const ip = getClientIp(req);
  const key = `${action}:${ip}`;
  const result = rateLimit(key, maxRequests, windowSeconds);

  if (!result.allowed) {
    throw new HttpError(
      429,
      `Too many requests. Please wait ${result.resetSeconds} seconds before trying again.`
    );
  }
}
