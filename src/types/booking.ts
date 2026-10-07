import { RouteSnapshot, BusSnapshot } from './trip';

export type BookingStatus = 'pending' | 'confirmed' | 'payment_failed' | 'cancelled' | 'boarded';
export type BookingType = 'guest' | 'account';

export interface PassengerDetails {
  name: string;
  phone: string;
  email?: string;
  uid?: string | null;
  nic?: string;
}

export interface BookingFares {
  ticketAmount: number;
  serviceFee?: number;
  platformCommission?: number;
  gatewayFee?: number;
  ownerNetAmount?: number;
  total?: number;
}

export interface Booking {
  id: string; // Order ID e.g. BK-178983...
  bookingReference?: string; // Cryptographically random, unpredictable reference e.g. SLB-7K9M-3P2W
  cCode?: string; // Unique 6-digit conductor verification code e.g. 582914
  accessToken?: string; // Secure token for guest ticket verification without account
  bookingType: BookingType; // 'guest' or 'account'
  tripId: string;
  userId?: string | null; // Authenticated user UID if signed in, null for guests
  ownerId?: string;
  passengerName: string;
  passengerPhone: string;
  passengerEmail?: string;
  passengerDetails: PassengerDetails;
  seats: string[];
  totalAmount: number;
  fares: BookingFares;
  status: BookingStatus;
  createdAt: number;
  updatedAt?: number;
  cancelledAt?: number;
  paymentId?: string;
  boarded?: boolean;
  boardedAt?: number;
  boardedBy?: string;
  refundId?: string;
  tripSnapshot?: {
    departureDate: string;
    departureTime: string;
    arrivalTime?: string;
    duration?: string;
    routeSnapshot: RouteSnapshot;
    busSnapshot: BusSnapshot;
    baseFare: number;
    farePerSeat?: number;
    ownerId: string;
    operatorName?: string;
  };
}

export interface SeatLock {
  userId: string; // User UID or Guest Session ID
  status: 'locked' | 'booked';
  expiresAt?: number;
  bookingId?: string;
  isMine?: boolean;
}
