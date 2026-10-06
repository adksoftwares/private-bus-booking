import { z } from 'zod';
import { MAX_SEATS_PER_BOOKING } from '@/lib/constants';

// Sri Lankan phone number regex: supports 077..., 9477..., +9477..., 77...
const sriLankanPhoneRegex = /^(?:\+?94|0)?[1-9]\d{8}$/;

export const createPendingBookingSchema = z.object({
  tripId: z.string().min(1, 'Trip ID is required'),
  selectedSeats: z
    .array(z.string().min(1, 'Invalid seat identifier'))
    .min(1, 'Please select at least one seat')
    .max(MAX_SEATS_PER_BOOKING, `Maximum ${MAX_SEATS_PER_BOOKING} seats per reservation`),
  passengerDetails: z.object({
    name: z.string().trim().min(2, 'Full Name must be at least 2 characters').max(100),
    phone: z
      .string()
      .trim()
      .refine(
        val => sriLankanPhoneRegex.test(val.replace(/[\s-]/g, '')),
        'Please enter a valid Sri Lankan mobile phone number (e.g. 0771234567)'
      ),
    email: z
      .string()
      .trim()
      .email('Invalid email address format')
      .optional()
      .or(z.literal(''))
  }),
  guestSessionId: z.string().optional()
});

export const cancelBookingSchema = z.object({
  bookingId: z.string().min(1, 'Booking ID is required'),
  accessToken: z.string().optional(),
  phone: z.string().optional()
});

export const lookupBookingSchema = z.object({
  reference: z.string().trim().min(1, 'Booking reference or Order ID is required'),
  accessToken: z.string().optional(),
  phone: z.string().optional()
});

export const linkAccountSchema = z.object({
  reference: z.string().trim().min(1, 'Booking reference or Order ID is required'),
  phone: z.string().optional(),
  accessToken: z.string().optional()
});

export const verifyTicketSchema = z.object({
  bookingId: z.string().trim().min(1, 'Booking ID or QR reference is required'),
  action: z.enum(['lookup', 'board']).default('lookup')
});

export const createTripSchema = z.object({
  busId: z.string().min(1, 'Valid bus must be selected'),
  startCity: z.string().trim().min(2, 'Origin city is required'),
  endCity: z.string().trim().min(2, 'Destination city is required'),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid travel date (YYYY-MM-DD) is required'),
  departureTime: z.string().regex(/^\d{2}:\d{2}$/, 'Valid departure time (HH:MM) is required'),
  arrivalTime: z.string().regex(/^\d{2}:\d{2}$/, 'Valid arrival time (HH:MM) is required').optional().or(z.literal('')),
  duration: z.string().optional(),
  farePerSeat: z.coerce.number().min(1, 'Fare must be greater than 0').max(50000, 'Fare cannot exceed 50,000 LKR'),
  stops: z.array(z.any()).optional()
}).refine(data => data.startCity.toLowerCase() !== data.endCity.toLowerCase(), {
  message: 'Origin and Destination cannot be the same city',
  path: ['endCity']
});

export const updateTripSchema = z.object({
  status: z.enum(['scheduled', 'cancelled', 'departed', 'completed']).optional(),
  farePerSeat: z.coerce.number().min(1, 'Fare must be greater than 0').max(50000, 'Fare cannot exceed 50,000 LKR').optional(),
  departureTime: z.string().regex(/^\d{2}:\d{2}$/, 'Valid departure time (HH:MM) is required').optional(),
  arrivalTime: z.string().regex(/^\d{2}:\d{2}$/, 'Valid arrival time (HH:MM) is required').optional()
});

export const submitBusRatingSchema = z.object({
  busId: z.string().min(1, 'Bus ID is required'),
  bookingId: z.string().min(1, 'Booking ID is required'),
  rating: z.number().int().min(1, 'Rating must be at least 1').max(5, 'Rating cannot exceed 5'),
  review: z.string().max(500, 'Review cannot exceed 500 characters').optional()
});

export function formatZodError(error: z.ZodError): string {
  if (error && error.issues && error.issues.length > 0) {
    return error.issues[0].message;
  }
  return 'Invalid input data';
}

