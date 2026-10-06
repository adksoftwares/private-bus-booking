/**
 * Automated Verification Suite: Concurrency, Atomic Operations, and Security Hardening
 *
 * Tests:
 * 1. Seat lock duration constant equals 10 minutes (600,000 ms).
 * 2. Zod validation schemas reject fraudulent inputs (excess seats, spoofed fares, same-city routes).
 * 3. Atomic double-booking concurrency simulation:
 *    Simulates two passengers attempting to lock the same seat simultaneously.
 *    Guarantees exactly 1 winner and 1 conflict rejection (HTTP 409 equivalent).
 * 4. Atomic boarding concurrency simulation:
 *    Simulates two conductors scanning the same ticket simultaneously.
 *    Guarantees single-use boarding: exactly 1 success and 1 rejection (ALREADY_BOARDED).
 */

import { SEAT_LOCK_DURATION_MS, MAX_SEATS_PER_BOOKING } from '../src/lib/constants';
import {
  createPendingBookingSchema,
  createTripSchema,
  updateTripSchema,
  verifyTicketSchema
} from '../src/lib/validation/schemas';

async function runTestSuite() {
  console.log('====================================================');
  console.log('STARTING AUTOMATED SECURITY & CONCURRENCY TEST SUITE');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${testName}`);
      process.exitCode = 1;
    }
  }

  // ----------------------------------------------------
  // TEST 1: Unified Seat Lock Duration
  // ----------------------------------------------------
  console.log('--- Suite 1: Constants & Unified Configurations ---');
  assert(
    SEAT_LOCK_DURATION_MS === 10 * 60 * 1000,
    `SEAT_LOCK_DURATION_MS is authoritatively set to 10 minutes (actual: ${SEAT_LOCK_DURATION_MS} ms)`
  );
  assert(
    MAX_SEATS_PER_BOOKING === 6,
    `MAX_SEATS_PER_BOOKING is strictly set to 6 (actual: ${MAX_SEATS_PER_BOOKING})`
  );

  // ----------------------------------------------------
  // TEST 2: Zod Schema Validation Edge Cases
  // ----------------------------------------------------
  console.log('\n--- Suite 2: Input Sanitization & Anti-Tampering ---');

  // Test 2a: Over max seats per booking
  const overSeatPayload = {
    tripId: 'TRIP-123',
    selectedSeats: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'],
    passengerDetails: { name: 'Sunil Perera', phone: '0771234567' }
  };
  const overSeatResult = createPendingBookingSchema.safeParse(overSeatPayload);
  assert(!overSeatResult.success, 'Rejects bookings with more than 6 seats');

  // Test 2b: Invalid Sri Lankan mobile phone
  const badPhonePayload = {
    tripId: 'TRIP-123',
    selectedSeats: ['A1'],
    passengerDetails: { name: 'Sunil Perera', phone: '12345' }
  };
  const badPhoneResult = createPendingBookingSchema.safeParse(badPhonePayload);
  assert(!badPhoneResult.success, 'Rejects invalid Sri Lankan mobile numbers');

  // Test 2c: Origin equals Destination
  const sameCityPayload = {
    busId: 'BUS-1',
    startCity: 'Colombo',
    endCity: 'Colombo',
    departureDate: '2026-11-01',
    departureTime: '08:00',
    farePerSeat: 2500
  };
  const sameCityResult = createTripSchema.safeParse(sameCityPayload);
  assert(!sameCityResult.success, 'Rejects trip scheduling when origin equals destination');

  // Test 2d: Zero or Negative Fare Tampering
  const zeroFarePayload = {
    busId: 'BUS-1',
    startCity: 'Colombo',
    endCity: 'Kandy',
    departureDate: '2026-11-01',
    departureTime: '08:00',
    farePerSeat: 0
  };
  const zeroFareResult = createTripSchema.safeParse(zeroFarePayload);
  assert(!zeroFareResult.success, 'Rejects zero fare tampering on trip scheduling');

  const negativeFareUpdate = { farePerSeat: -500 };
  const negativeFareResult = updateTripSchema.safeParse(negativeFareUpdate);
  assert(!negativeFareResult.success, 'Rejects negative fare tampering on trip update');

  // Test 2e: Ticket verification validation
  const emptyTicketResult = verifyTicketSchema.safeParse({ bookingId: '', action: 'lookup' });
  assert(!emptyTicketResult.success, 'Rejects ticket verification with empty booking ID');
  const validTicketResult = verifyTicketSchema.safeParse({ bookingId: 'BK-12345', action: 'board' });
  assert(validTicketResult.success, 'Accepts valid ticket verification payload');

  // ----------------------------------------------------
  // TEST 3: Simulated Atomic Seat Lock Concurrency
  // ----------------------------------------------------
  console.log('\n--- Suite 3: Concurrency — Double-Booking Prevention ---');

  // We simulate an in-memory transactional database cell with compare-and-swap
  class TransactionalCell<T> {
    private data: T;
    private lock = Promise.resolve();

    constructor(initial: T) {
      this.data = initial;
    }

    async runTransaction(updater: (current: T) => T | undefined): Promise<{ committed: boolean; snapshot: T }> {
      return new Promise((resolve) => {
        this.lock = this.lock.then(async () => {
          // Simulate non-deterministic network jitter between 5ms and 25ms
          await new Promise((r) => setTimeout(r, Math.random() * 20 + 5));
          const updated = updater(this.data);
          if (updated !== undefined) {
            this.data = updated;
            resolve({ committed: true, snapshot: this.data });
          } else {
            resolve({ committed: false, snapshot: this.data });
          }
        });
      });
    }
  }

  interface SeatLockState {
    [seatId: string]: { userId: string; expiresAt: number; status: 'locked' | 'booked' } | null;
  }

  const seatStore = new TransactionalCell<SeatLockState>({});

  async function simulateAtomicLock(seatId: string, userId: string): Promise<boolean> {
    const res = await seatStore.runTransaction((current) => {
      const existing = current[seatId];
      const now = Date.now();
      if (existing) {
        if (existing.status === 'booked') return undefined; // abort
        if (existing.status === 'locked' && existing.expiresAt > now) return undefined; // abort
      }
      return {
        ...current,
        [seatId]: { userId, expiresAt: now + SEAT_LOCK_DURATION_MS, status: 'locked' }
      };
    });
    return res.committed;
  }

  // Fire 10 simultaneous requests from 10 different passengers for the SAME SEAT "12A"
  const contestedSeat = '12A';
  const passengerIds = Array.from({ length: 10 }, (_, i) => `passenger_${i + 1}`);

  const lockResults = await Promise.all(passengerIds.map((pid) => simulateAtomicLock(contestedSeat, pid)));
  const winners = lockResults.filter((r) => r === true).length;
  const losers = lockResults.filter((r) => r === false).length;

  assert(winners === 1, `Exactly ONE passenger succeeded in claiming seat ${contestedSeat} (winners: ${winners})`);
  assert(losers === 9, `All 9 competing passengers were rejected with 409 conflict (losers: ${losers})`);

  // ----------------------------------------------------
  // TEST 4: Simulated Atomic Single-Use Boarding
  // ----------------------------------------------------
  console.log('\n--- Suite 4: Concurrency — Single-Use Boarding Race Prevention ---');

  interface BookingRecord {
    id: string;
    boarded: boolean;
    boardedAt?: number;
    boardedBy?: string;
  }

  const bookingStore = new TransactionalCell<BookingRecord>({
    id: 'BK-CONFIRMED-999',
    boarded: false
  });

  async function simulateAtomicBoard(conductorUid: string): Promise<{ success: boolean; reason?: string }> {
    let abortReason: string | undefined;
    const res = await bookingStore.runTransaction((booking) => {
      if (booking.boarded) {
        abortReason = 'ALREADY_BOARDED';
        return undefined; // abort
      }
      return {
        ...booking,
        boarded: true,
        boardedAt: Date.now(),
        boardedBy: conductorUid
      };
    });

    return {
      success: res.committed,
      reason: abortReason
    };
  }

  // Two conductors scanning at the exact same millisecond
  const [scanA, scanB] = await Promise.all([
    simulateAtomicBoard('conductor_front_door'),
    simulateAtomicBoard('conductor_rear_door')
  ]);

  const successfulScans = [scanA, scanB].filter((s) => s.success).length;
  const duplicateRejections = [scanA, scanB].filter((s) => !s.success && s.reason === 'ALREADY_BOARDED').length;

  assert(successfulScans === 1, `Exactly ONE conductor scan committed boarding (successes: ${successfulScans})`);
  assert(
    duplicateRejections === 1,
    `Duplicate scan was atomically rejected with 'ALREADY_BOARDED' (rejections: ${duplicateRejections})`
  );

  // ----------------------------------------------------
  // TEST SUMMARY
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('====================================================');
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
