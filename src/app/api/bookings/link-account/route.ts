import { NextResponse } from 'next/server';
import { requireAuth, HttpError } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { linkAccountSchema, formatZodError } from '@/lib/validation/schemas';
import { linkGuestBookingToAccount } from '@/lib/services/booking-service';

export async function POST(req: Request) {
  try {
    // 1. Rate limiting
    await enforceRateLimit(req, 'link_account', 10, 60);

    // 2. Server-verified Authentication (immune to client-supplied userId spoofing)
    const authenticatedUser = await requireAuth(req);

    // 3. Validate input payload
    const body = await req.json();
    const parseResult = linkAccountSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: formatZodError(parseResult.error) },
        { status: 400 }
      );
    }

    const { reference, accessToken, phone } = parseResult.data;

    // 4. Delegate to domain service
    const result = await linkGuestBookingToAccount(
      reference,
      accessToken,
      phone,
      authenticatedUser.uid
    );

    return NextResponse.json(result);

  } catch (error: unknown) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Link account error:", error);
    return NextResponse.json({ error: 'Failed to link booking to account.' }, { status: 500 });
  }
}
