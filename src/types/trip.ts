export interface SeatLayout {
  rows: number;
  cols: number;
  aisleCol: number;
  type?: '2x3' | '2x2' | '2+1' | '3:2' | '2:2' | string;
  totalSeats?: number;
  backRowType?: '5-seater' | '4-seater' | 'with-aisle';
}

export interface BusSnapshot {
  name: string;
  regNumber: string;
  type: string;
  totalSeats: number;
  seatLayout: SeatLayout;
  amenities?: string[];
  operatorName?: string;
  imageUrl?: string;
}

export interface RouteStop {
  city: string;
  stopName?: string;
  timeOffsetMinutes?: number;
  stopOrder?: number;
}

export interface RouteSnapshot {
  id?: string;
  startCity: string;
  endCity: string;
  stops?: RouteStop[];
  distanceKm?: number;
  estDuration?: string;
}

export interface BookedSeatInfo {
  gender?: string;
  status: 'booked' | 'locked';
  uid: string;
}

export interface Trip {
  id: string;
  baseFare: number;
  farePerSeat?: number; // Explicit individual fare per passenger
  busId: string;
  busSnapshot: BusSnapshot;
  departureDate: string; // YYYY-MM-DD
  departureTime: string; // HH:MM
  arrivalTime?: string; // HH:MM
  duration?: string; // e.g. "6h 30m"
  ownerId: string;
  operatorName?: string;
  routeId: string;
  routeSnapshot: RouteSnapshot;
  status: 'scheduled' | 'departed' | 'completed' | 'cancelled';
  bookedSeats?: Record<string, BookedSeatInfo>;
  createdAt?: number;
  updatedAt?: number;
}
