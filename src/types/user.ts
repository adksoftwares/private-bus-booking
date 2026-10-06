export type UserRole = 'Passenger' | 'Conductor' | 'Owner' | 'Admin';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  mobile?: string;
  role: UserRole;
  createdAt?: number;
  updatedAt?: number;
}

export interface OwnerProfile {
  uid: string;
  name: string;
  email: string;
  phone: string;
  nic: string;
  address: string;
  role: 'Owner';
  status: 'pending' | 'approved' | 'rejected';
  createdAt?: number;
  updatedAt?: number;
}
