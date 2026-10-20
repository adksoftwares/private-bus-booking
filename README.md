# Private Bus Booking

A multilingual bus-booking web application built with Next.js, React, TypeScript, Supabase, and next-intl. The project includes public trip search, seat selection/locking, booking lookup, owner trip management, staff scanning routes, and a PayHere integration.

## Requirements

- Node.js compatible with the installed Next.js version
- npm
- A Supabase project configured for this application
- Environment variables configured locally and in the deployment platform
- Upstash Redis REST credentials for production-wide rate limiting

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure the environment variables required by the Supabase client and the application. Use the variable names referenced in the source code and keep secret values out of Git.
3. Start the development server:

   ```bash
   npm run dev
   ```

4. Open http://localhost:3000.

## Useful scripts

- `npm run dev` — start the development server
- `npm run build` — create a production build
- `npm run start` — serve the production build
- `npm run lint` — run ESLint
- `npm test` — run the concurrency/security test script at `scripts/test-concurrency-and-security.ts`

A script existing in the repository does not mean it has passed. Run the checks locally and in CI before deploying.

## Rate limiting configuration

Non-PayHere API rate limits use shared, atomic counters through Upstash Redis. Existing PayHere route code is intentionally left unchanged and still uses the legacy process-local limiter. Configure these server-only environment variables locally and in the deployment platform:

- `UPSTASH_REDIS_REST_URL` — Upstash Redis REST endpoint
- `UPSTASH_REDIS_REST_TOKEN` — Upstash Redis REST token
- `TRUST_PROXY_HEADERS=true` — optional; enable only if the hosting proxy reliably overwrites `X-Forwarded-For`. The app prefers `X-Real-IP` when available.

For handlers using the shared limiter, production requests fail closed with HTTP 503 if Redis is missing or unavailable. The process-local fallback is for development only. Existing PayHere handlers are excluded by design in this change and need a separate review before claiming all endpoints have distributed rate limiting. Never expose the Redis token to client-side code.

## Application areas

- Public trip search and schedule discovery
- Route-aware results, filtering, and sorting
- Seat selection and temporary seat locks
- Booking lookup and ticket display
- Bus-owner trip management
- Staff ticket-scanning experience
- Supabase-backed data and database migrations
- PayHere payment integration

## Security and release checklist

Before deploying to production:

- Confirm all required Supabase tables, functions, grants, and migrations are applied to the intended project.
- Verify Row Level Security policies and server-side role/ownership checks for every private resource.
- Test simultaneous attempts to reserve the same seat, expired locks, retries, and duplicate requests.
- Check booking lookup for authorization enforcement, data minimization, and resistance to reference enumeration.
- Use a shared/distributed rate limiter for multi-instance deployments; process-local limits are not a production-wide control.
- Confirm proxy/IP header trust is configured for the actual hosting environment.
- Review cache headers and ensure user-specific or sensitive data is never shared through a public cache.
- Run `npm run lint`, `npm test`, and `npm run build`; fix failures before release.
- Review payment confirmation separately. Never treat a browser/client callback alone as proof of payment. Keep payment credentials server-side and use provider-verified confirmation for paid status.

## Payment integration note

PayHere integration is intentionally retained as existing application code. Do not enable live payments until merchant onboarding, provider verification, environment configuration, and the payment confirmation flow have been independently checked. A client-side completion event alone must not authorize a booking to become paid/confirmed.

## UI and accessibility notes

The shared stylesheet includes visible keyboard focus indicators and reduced-motion support. Continue to test passenger booking on small mobile screens, keyboard-only navigation, screen readers, loading/error/empty states, and print output for tickets.

## Deployment

Deploy using the hosting platform configured for the repository. Set environment variables in the deployment environment, apply database migrations deliberately, and validate the production build and core booking flow in a staging environment before directing real passengers to the service.
