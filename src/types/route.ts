import { RouteStop } from './trip';

export interface Route {
  id: string;
  startCity: string;
  endCity: string;
  name?: string;
  stops?: RouteStop[];
  distanceKm?: number;
  estDuration?: string;
  status: 'active' | 'inactive';
  ownerId?: string;
  createdAt?: number;
  updatedAt?: number;
}
