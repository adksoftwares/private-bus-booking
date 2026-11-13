# Native Android Driver GPS Companion

This is the native Android foreground-location companion for the existing Private Bus Booking web platform. It uses the existing account roles; drivers and conductors sign in with the shared existing Conductor account.

## Configure
1. Open this folder as an Android Studio project.
2. In app/build.gradle.kts replace the three BuildConfig values:
   - APP_BASE_URL: deployed Next.js app origin, including https:// and no trailing slash.
   - SUPABASE_URL: the Supabase project URL.
   - SUPABASE_ANON_KEY: the public anon key (never put the service-role key in this app).
3. Ensure the web deployment has SUPABASE_SERVICE_ROLE_KEY configured server-side.
4. Build and install the debug APK on the assigned bus Android phone.

## Driver operation
1. Sign in using the driver's existing account email and password.
2. Enter the trip ID assigned by the bus owner.
3. Press Start trip GPS and grant precise location and notification permissions.
4. Android displays a persistent foreground-service notification while location is shared.
5. Press Finish trip at the destination. The server closes the trip session.

## Why this is a native service
The foreground location service continues receiving location updates while the screen is off, unlike browser geolocation which can be suspended. Android still controls background execution: battery restrictions, force-stop, revoked permissions, device shutdown, loss of GPS or network can interrupt tracking. Do not promise absolute 24-hour uptime. Keep the device charged, disable battery optimisation for this app where the device permits it, and check the persistent notification before departure.

## Security
- Login uses Supabase Auth password grant with the public anon key.
- Access and refresh tokens are stored using Android EncryptedSharedPreferences; the service refreshes expired access tokens during long trips. GPS points are queued in encrypted local preferences and replayed when connectivity returns.
- All tracking requests carry the signed-in account's bearer token.
- Server verifies that the Conductor account is assigned to the requested trip before accepting GPS.
- Never embed SUPABASE_SERVICE_ROLE_KEY in this Android project.
