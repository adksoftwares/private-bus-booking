import { SeatLayout } from './trip';

export interface Bus {
  id: string;
  ownerId: string;
  operatorName?: string;
  name: string;
  regNumber: string;
  type: 'Super Luxury AC' | 'Semi Luxury' | 'Highway Express' | 'Normal (SLTB / Private)' | string;
  totalSeats: number;
  seatLayout: SeatLayout;
  amenities: string[];
  imageUrl?: string;
  defaultFare?: number;
  status: 'active' | 'maintenance' | 'inactive';
  createdAt: number;
  updatedAt?: number;
}
