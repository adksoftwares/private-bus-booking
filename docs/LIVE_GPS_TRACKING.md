# Account-scoped GPS access rules
- Exactly four account roles remain: Admin, Owner, Conductor (shared Driver/Conductor account), Passenger/Customer.
- Admin can track all buses and trips.
- Owner can track only trips where trips.owner_id equals the signed-in owner ID.
- Driver/Conductor can track and send GPS only for trips with a matching staff_trip_assignments row for their signed-in user ID.
- Customer can track only a trip with a booking row whose user_id equals the signed-in user ID and booking_type is account.
- Guest bookings are not trackable from a customer account. Logging out and making a guest booking does not grant tracking access, even if the same person has an account.
- A saved mobile number is a contact record only. It does not authenticate a person or grant GPS permissions.
- Customer tracking API requires the signed-in account session; booking reference/access-token guest tracking is disabled.

## GPS operation
- Driver/Conductor device signs in and grants geolocation permission, then sends location points while a trip session is live.
- Browser geolocation may stop when the screen is locked or browser is suspended. Reliable screen-off tracking requires a native Android foreground location service or approved hardware GPS tracker.
- Use HTTPS and keep service-role credentials server-side.