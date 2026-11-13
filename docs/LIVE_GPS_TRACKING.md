# Live GPS tracking: deployment and operation

## Account permissions (existing four roles only)
- Admin: all buses and trips.
- Owner: only buses and trips owned by the signed-in owner.
- Driver / Conductor: one existing Conductor account, only trips assigned to that user in staff_trip_assignments.
- Customer: only trips booked while signed in to the same account (booking_type=account and matching user_id).
- Guest bookings have no customer account tracking access. A saved phone number is a contact only, never an authentication credential or GPS permission.

## Web routes
- /owner/tracking: Owner sees own fleet; Admin sees platform-wide fleet. Refreshes live status every 10 seconds.
- /gps: assigned Driver / Conductor trip selection and browser GPS controls.
- /track/[tripId]: customer tracking, requires the signed-in account booking.

## API routes
- GET /api/tracking/fleet: owner/admin fleet summary and latest positions.
- GET /api/tracking/assigned-trips: trips assigned to the signed-in Conductor account.
- GET /api/tracking/[tripId]: account-scoped live location and route history.
- POST /api/tracking/[tripId]: start, pause, resume and finish a trip.
- POST /api/tracking/[tripId]/location: authenticated assigned staff GPS upload.
- GET/POST/DELETE /api/owner/contacts: owner-managed contact directory.

## Supabase and web deployment
1. The GPS migration `live_gps_tracking` has been applied to Supabase project `yeixbbhqckysjugtelix`; verify this remains the intended project before promoting another environment.
2. Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` as deployment variables. Keep the service-role key server-only. Do not expose it in NEXT_PUBLIC variables or mobile builds.
3. Deploy the Next.js site over HTTPS.
4. The tracking tables use RLS; private GPS reads and writes are mediated by server routes that verify the current account and trip relationship.

## Native Android screen-off GPS
The android-driver-gps folder contains a native Android app and a location foreground service.
1. Open android-driver-gps in Android Studio.
2. Run the GitHub Actions workflow **Build Android Driver GPS APK** and provide the deployed website HTTPS origin. The workflow builds the APK and uploads it as an artifact. The Supabase URL and publishable key are configured for the linked Supabase project; use only the public key in the mobile app.
3. Build and install the APK on the assigned bus phone.
4. Driver signs in with the existing Conductor account, enters the assigned trip ID, grants precise location and notification permissions, and presses Start trip GPS.
5. Android shows an ongoing notification and the foreground service sends location points to the authenticated tracking API. Driver presses Finish trip at destination.
6. Disable battery optimisation for the app where Android allows it, keep the phone charged, and verify the ongoing notification before departure.

Android foreground services are substantially more reliable than browser GPS with the screen off, but no mobile OS can guarantee uninterrupted 24-hour tracking if the user force-stops the app, the phone powers off, permissions are revoked, GPS is unavailable or the device loses connectivity. The companion has an encrypted, bounded offline queue and refreshes expired Auth sessions. The driver app waits for queued points to upload before marking the trip complete. Automatic reboot recovery is not included.
