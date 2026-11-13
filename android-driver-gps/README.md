# Native Android Driver GPS Companion

This is the native Android foreground-location companion for the existing Private Bus Booking web platform. It uses the existing account roles; drivers and conductors sign in with the shared existing Conductor account.

## Build the APK from GitHub

1. Open the repository's **Actions** tab.
2. Select **Build Android Driver GPS APK**.
3. Choose **Run workflow**.
4. Enter the deployed Private Bus Booking website HTTPS origin, for example `https://booking.example.com` (origin only; no route path).
5. Run the workflow. When it succeeds, download the `private-bus-driver-gps-debug-apk` artifact from that workflow run.

The workflow builds the Android app with the connected Supabase project URL and its public publishable key. The website origin is required as a workflow input and is not guessed. You can also open this directory in Android Studio and build the `app` debug variant after setting the `APP_BASE_URL` Gradle property.

The public publishable key is intended for client applications. Never put `SUPABASE_SERVICE_ROLE_KEY` in this Android project.

## Required web deployment configuration

Ensure the Next.js hosting environment has `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the server-only `SUPABASE_SERVICE_ROLE_KEY` configured. The service-role key must never be exposed to the browser or mobile app.

## Driver operation

1. Sign in using the driver's existing account email and password.
2. Enter the trip ID assigned by the bus owner.
3. Press Start trip GPS and grant precise location and notification permissions.
4. Android displays a persistent foreground-service notification while location is shared.
5. Press Finish trip at the destination. The app waits up to 30 seconds for queued GPS points to upload before asking the server to complete the trip. If points remain queued, keep tracking active and try again after connectivity returns.

## Why this is a native service

The foreground location service continues receiving location updates while the screen is off, unlike browser geolocation which can be suspended. Android still controls background execution: battery restrictions, force-stop, revoked permissions, device shutdown, loss of GPS or network can interrupt tracking. Do not promise absolute 24-hour uptime. Keep the device charged, disable battery optimisation for this app where the device permits it, and check the persistent notification before departure.

## Security and limitations

- Login uses Supabase Auth password grant with the public publishable key.
- Access and refresh tokens are stored using Android EncryptedSharedPreferences; the service refreshes expired Auth sessions during long trips.
- GPS points are queued in encrypted local preferences and replayed when connectivity returns, up to the configured queue limit.
- All tracking requests carry the signed-in account's bearer token.
- Server verifies that the Conductor account is assigned to the requested trip before accepting GPS.
- Browser GPS is enabled only for the same website origin through the Permissions-Policy header. Browser tracking may still stop when Android suspends the browser; use the native service for screen-off tracking.
- No automatic reboot recovery is included. No mobile OS can guarantee uninterrupted tracking if the app is force-stopped, the phone powers off, permissions are revoked, GPS is unavailable or the device loses connectivity.
