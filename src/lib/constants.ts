/**
 * System-wide Constants and Configuration
 * Single source of truth across Backend, Frontend, and Cloud Services.
 */

// Seat Lock Duration (10 Minutes)
export const SEAT_LOCK_DURATION_MINUTES = 10;
export const SEAT_LOCK_DURATION_MS = SEAT_LOCK_DURATION_MINUTES * 60 * 1000;

// Maximum Seats allowed in a single booking reservation
export const MAX_SEATS_PER_BOOKING = 6;

// Standard Currency for Sri Lankan Bus Operations
export const DEFAULT_CURRENCY = 'LKR';

// PayHere Status Codes
export const PAYHERE_STATUS = {
  SUCCESS: '2',
  PENDING: '0',
  CANCELED: '-1',
  FAILED: '-2',
  CHARGEDBACK: '-3'
} as const;

// Booking Lifecycle States
export type BookingStatus = 
  | 'pending'
  | 'confirmed'
  | 'boarded'
  | 'cancelled'
  | 'payment_failed'
  | 'expired'
  | 'refunded';

// Valid Booking State Transitions
export const VALID_BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ['confirmed', 'payment_failed', 'expired', 'cancelled'],
  confirmed: ['boarded', 'cancelled', 'refunded'],
  boarded: [], // Terminal state - cannot be cancelled or re-confirmed
  payment_failed: ['pending'], // Retry scenario
  cancelled: ['refunded'],
  expired: [],
  refunded: []
};
