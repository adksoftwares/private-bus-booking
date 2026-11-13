# Native Android Driver GPS Companion

This is the native Android foreground-location companion for the existing Private Bus Booking web platform. It uses the existing account roles; drivers and conductors sign in with the shared existing Conductor account.

## Configure and build

1. Open this folder as an Android Studio project.
2. Build with your deployed Next.js HTTPS origin:
   ```bash
   ./gradlew assembleDebug -PAPP_BASE_URL=https://YOUR-PRODUCTION-DOMAIN
   ```
   You can also set `APP_BASE_URL` in the build environment. Do not use a guessed or placeholder domain.
3. The Supabase project URL and public publishable key are preconfigured for this project's Supabase instance. Override them with Gradle properties `SUPABASE_URL` and `SUPABASE_ANON_KEY` only when building for a different Supabase project.
4. Ensure the web deployment has `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the server-only `SUPABASE_SERVICE_ROLE_KEY` configured.
5. Build and install the debug APK on the assigned bus Android phone.

The public publishable key is intended for client applications. Never put `SUPABASE_SERVICE_ROLE_KEY` in this Android project.

## Driver operation

1. Sign in using the driver's existing account email and password.
2. Enter the trip ID assigned by the bus owner.
3. Press Start trip GPS and grant precise location and notification permissions.
4. Android displays a persistent foreground-service notification while location is shared.
5. Press Finish trip at the destination. The server closes the trip session.

## Why this is a native service

The foreground location service continues receiving location updates while the screen is off, unlike browser geolocation which can be suspended. Android still controls background execution: battery restrictions, force-stop, revoked permissions, device shutdown, loss of GPS or network can interrupt tracking. Do not promise absolute 24-hour uptime. Keep the device charged, disable battery optimisation for this app where the device permits it, and check the persistent notification before departure.

## Security and limitations

- Login uses Supabase Auth password grant with the public publishable key.
- Access and refresh tokens are stored using Android EncryptedSharedPreferences; the service refreshes expired Auth sessions during long trips.
- GPS points are queued in encrypted local preferences and replayed when connectivity returns, up to the configured queue limit. Points queued after a trip has already been marked complete cannot be uploaded by the live-only endpoint; finish only after the phone has had a chance to upload pending points.
- All tracking requests carry the signed-in account's bearer token.
- Server verifies that the Conductor account is assigned to the requested trip before accepting GPS.
- Browser GPS is enabled only for the same website origin through the Permissions-Policy header. Browser tracking may still stop when Android suspends the browser; use the native service for screen-off tracking.
- No automatic reboot recovery is included. No mobile OS can guarantee uninterrupted tracking if the app is force-stopped, the phone powers off, permissions are revoked, GPS is unavailable or the device loses connectivity.
