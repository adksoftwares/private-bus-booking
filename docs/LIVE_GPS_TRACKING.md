# Live GPS Tracking & Fleet Supervisor Module

This feature adds trip-scoped GPS tracking to the existing Next.js + Supabase booking application.

## Included
- GPS session states: scheduled, live, paused and completed.
- Driver/assigned-staff location ingestion with validated coordinates, accuracy, speed and heading.
- Timestamped route history and latest bus position.
- Owner-managed Sri Lankan mobile contact numbers for supervisors, drivers, conductors, office and emergency contacts.
- Optional bus- or trip-scoped supervisor access. Supervisors with tracking-control permission can start, pause, resume and finish a trip.
- Customer tracking reads require both booking reference and booking access token.
- GPS records are private under RLS. Passenger access is mediated by the token-validated server route.

## Deployment and operation
1. Apply supabase/migrations/20261113_live_gps_tracking.sql to the Supabase project.
2. Keep SUPABASE_SERVICE_ROLE_KEY server-only.
3. Driver devices must sign in and grant location permission. Use HTTPS in production.
4. Browser geolocation cannot guarantee continuous tracking after the browser is closed or the phone suspends the page. For dependable screen-off tracking, ship a native Android driver app using a foreground location service and persistent notification.
5. Customer tracking page should call GET /api/tracking/{tripId}?bookingReference=...&accessToken=... and refresh while the session is live.
6. Owner/supervisor dashboard calls GET /api/tracking/{tripId}. Driver device sends POST /api/tracking/{tripId}/location with latitude, longitude, accuracy, speed (m/s), and heading while session is live.
7. Start/pause/resume/stop with POST /api/tracking/{tripId} and JSON action.
8. Manage contacts with GET/POST/DELETE /api/owner/contacts. POST fields: name, phone, contactType, optional busId, tripId, canControlTracking.

## GPS source
A phone number by itself cannot provide a GPS location. The driver must sign in and allow location sharing, or a dedicated GPS tracker must be integrated. Location sharing must be visible to the driver and limited to an active assigned trip.
