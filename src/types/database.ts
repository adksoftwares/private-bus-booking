export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'Passenger' | 'Owner' | 'Conductor' | 'Admin';
export type BookingStatus = 'pending' | 'confirmed' | 'payment_failed' | 'cancelled' | 'boarded';
export type BookingType = 'guest' | 'account';
export type SeatLockStatus = 'locked' | 'booked';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string;
          email: string | null;
          phone: string | null;
          role: UserRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          role?: UserRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string | null;
          phone?: string | null;
          role?: UserRole;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      owners: {
        Row: {
          id: string;
          name: string;
          email: string | null;
          phone: string | null;
          nic: string | null;
          address: string | null;
          status: string;
          registered_at: string;
        };
        Insert: {
          id: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          nic?: string | null;
          address?: string | null;
          status?: string;
          registered_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string | null;
          phone?: string | null;
          nic?: string | null;
          address?: string | null;
          status?: string;
          registered_at?: string;
        };
        Relationships: [];
      };
      staff: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          phone: string | null;
          role: string;
          status: string;
          created_at: string;
        };
        Insert: {
          id: string;
          owner_id: string;
          name: string;
          phone?: string | null;
          role: string;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          phone?: string | null;
          role?: string;
          status?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      buses: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          reg_number: string;
          type: string;
          total_seats: number;
          seat_layout: Json;
          amenities: string[] | null;
          image_url: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          owner_id: string;
          name: string;
          reg_number: string;
          type: string;
          total_seats: number;
          seat_layout?: Json;
          amenities?: string[] | null;
          image_url?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          reg_number?: string;
          type?: string;
          total_seats?: number;
          seat_layout?: Json;
          amenities?: string[] | null;
          image_url?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      routes: {
        Row: {
          id: string;
          start_city: string;
          end_city: string;
          stops: Json;
          distance_km: number | null;
          est_duration: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          start_city: string;
          end_city: string;
          stops?: Json;
          distance_km?: number | null;
          est_duration?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          start_city?: string;
          end_city?: string;
          stops?: Json;
          distance_km?: number | null;
          est_duration?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      trips: {
        Row: {
          id: string;
          bus_id: string;
          owner_id: string;
          route_id: string | null;
          route_snapshot: Json;
          bus_snapshot: Json;
          departure_date: string;
          departure_time: string;
          arrival_time: string | null;
          duration: string | null;
          base_fare: number;
          fare_per_seat: number;
          operator_name: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          bus_id: string;
          owner_id: string;
          route_id?: string | null;
          route_snapshot: Json;
          bus_snapshot: Json;
          departure_date: string;
          departure_time: string;
          arrival_time?: string | null;
          duration?: string | null;
          base_fare: number;
          fare_per_seat: number;
          operator_name?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          bus_id?: string;
          owner_id?: string;
          route_id?: string | null;
          route_snapshot?: Json;
          bus_snapshot?: Json;
          departure_date?: string;
          departure_time?: string;
          arrival_time?: string | null;
          duration?: string | null;
          base_fare?: number;
          fare_per_seat?: number;
          operator_name?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      bookings: {
        Row: {
          id: string;
          booking_reference: string;
          access_token: string;
          access_token_hash: string | null;
          booking_type: BookingType;
          trip_id: string;
          user_id: string | null;
          owner_id: string;
          passenger_name: string;
          passenger_phone: string;
          passenger_email: string | null;
          passenger_details: Json;
          seats: string[];
          total_amount: number;
          fares: Json;
          status: BookingStatus;
          boarded: boolean;
          boarded_at: string | null;
          boarded_by: string | null;
          payment_id: string | null;
          refund_id: string | null;
          trip_snapshot: Json;
          created_at: string;
          updated_at: string;
          cancelled_at: string | null;
        };
        Insert: {
          id: string;
          booking_reference: string;
          access_token?: string;
          access_token_hash?: string | null;
          booking_type?: BookingType;
          trip_id: string;
          user_id?: string | null;
          owner_id: string;
          passenger_name: string;
          passenger_phone: string;
          passenger_email?: string | null;
          passenger_details?: Json;
          seats: string[];
          total_amount: number;
          fares?: Json;
          status?: BookingStatus;
          boarded?: boolean;
          boarded_at?: string | null;
          boarded_by?: string | null;
          payment_id?: string | null;
          refund_id?: string | null;
          trip_snapshot: Json;
          created_at?: string;
          updated_at?: string;
          cancelled_at?: string | null;
        };
        Update: {
          id?: string;
          booking_reference?: string;
          access_token?: string;
          access_token_hash?: string | null;
          booking_type?: BookingType;
          trip_id?: string;
          user_id?: string | null;
          owner_id?: string;
          passenger_name?: string;
          passenger_phone?: string;
          passenger_email?: string | null;
          passenger_details?: Json;
          seats?: string[];
          total_amount?: number;
          fares?: Json;
          status?: BookingStatus;
          boarded?: boolean;
          boarded_at?: string | null;
          boarded_by?: string | null;
          payment_id?: string | null;
          refund_id?: string | null;
          trip_snapshot?: Json;
          created_at?: string;
          updated_at?: string;
          cancelled_at?: string | null;
        };
        Relationships: [];
      };
      seat_locks: {
        Row: {
          id: number;
          trip_id: string;
          seat_id: string;
          user_id: string;
          booking_id: string | null;
          status: SeatLockStatus;
          expires_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          trip_id: string;
          seat_id: string;
          user_id: string;
          booking_id?: string | null;
          status?: SeatLockStatus;
          expires_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          trip_id?: string;
          seat_id?: string;
          user_id?: string;
          booking_id?: string | null;
          status?: SeatLockStatus;
          expires_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          booking_id: string;
          order_id: string;
          amount: number;
          currency: string;
          status: string;
          provider: string;
          payhere_payment_id: string | null;
          payment_method: string | null;
          raw_notification: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          booking_id: string;
          order_id: string;
          amount: number;
          currency?: string;
          status?: string;
          provider?: string;
          payhere_payment_id?: string | null;
          payment_method?: string | null;
          raw_notification?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          booking_id?: string;
          order_id?: string;
          amount?: number;
          currency?: string;
          status?: string;
          provider?: string;
          payhere_payment_id?: string | null;
          payment_method?: string | null;
          raw_notification?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      refunds: {
        Row: {
          id: string;
          booking_id: string;
          user_id: string;
          original_amount: number;
          refund_amount: number;
          refund_percentage: number;
          status: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          booking_id: string;
          user_id: string;
          original_amount: number;
          refund_amount: number;
          refund_percentage: number;
          status?: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          booking_id?: string;
          user_id?: string;
          original_amount?: number;
          refund_amount?: number;
          refund_percentage?: number;
          status?: string;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      bus_reviews: {
        Row: {
          id: string;
          bus_id: string;
          booking_id: string | null;
          user_id: string | null;
          passenger_name: string | null;
          rating: number;
          comment: string | null;
          cleanliness_rating: number | null;
          punctuality_rating: number | null;
          comfort_rating: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          bus_id: string;
          booking_id?: string | null;
          user_id?: string | null;
          passenger_name?: string | null;
          rating: number;
          comment?: string | null;
          cleanliness_rating?: number | null;
          punctuality_rating?: number | null;
          comfort_rating?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          bus_id?: string;
          booking_id?: string | null;
          user_id?: string | null;
          passenger_name?: string | null;
          rating?: number;
          comment?: string | null;
          cleanliness_rating?: number | null;
          punctuality_rating?: number | null;
          comfort_rating?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      staff_trip_assignments: {
        Row: {
          id: number;
          trip_id: string;
          staff_id: string;
          assigned_role: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          trip_id: string;
          staff_id: string;
          assigned_role: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          trip_id?: string;
          staff_id?: string;
          assigned_role?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          actor_id: string | null;
          actor_role: string | null;
          action: string;
          resource_type: string;
          resource_id: string | null;
          metadata: Json;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          actor_role?: string | null;
          action: string;
          resource_type: string;
          resource_id?: string | null;
          metadata?: Json;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_id?: string | null;
          actor_role?: string | null;
          action?: string;
          resource_type?: string;
          resource_id?: string | null;
          metadata?: Json;
          ip_address?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_pending_booking_atomic: {
        Args: {
          p_order_id: string;
          p_booking_reference: string;
          p_access_token_hash: string;
          p_booking_type: string;
          p_trip_id: string;
          p_user_id?: string | null;
          p_passenger_name?: string | null;
          p_passenger_phone?: string | null;
          p_passenger_email?: string | null;
          p_passenger_details?: Json;
          p_seat_ids: string[];
          p_duration_seconds?: number;
        };
        Returns: Json;
      };
      lock_seats_atomic: {
        Args: {
          p_trip_id: string;
          p_seat_ids: string[];
          p_user_id: string;
          p_booking_id?: string | null;
          p_duration_seconds?: number;
        };
        Returns: Json;
      };
      unlock_seat_atomic: {
        Args: {
          p_trip_id: string;
          p_seat_id: string;
          p_user_id: string;
        };
        Returns: boolean;
      };
      confirm_booking_seats_atomic: {
        Args: {
          p_trip_id: string;
          p_seat_ids: string[];
          p_booking_id: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      process_payment_webhook_atomic: {
        Args: {
          p_order_id: string;
          p_payment_id: string;
          p_amount: number;
          p_currency: string;
          p_status_code: string;
          p_raw_payload?: Json;
        };
        Returns: Json;
      };
      board_passenger_atomic: {
        Args: {
          p_booking_id: string;
          p_conductor_id: string;
        };
        Returns: Json;
      };
      cancel_booking_atomic: {
        Args: {
          p_booking_id: string;
          p_caller_id?: string | null;
          p_access_token?: string | null;
          p_access_token_hash?: string | null;
          p_is_admin?: boolean;
        };
        Returns: Json;
      };
      get_trip_seat_availability: {
        Args: {
          p_trip_id: string;
          p_caller_user_id?: string;
        };
        Returns: Array<{
          seat_id: string;
          status: string;
          is_mine: boolean;
          expires_at: string | null;
        }>;
      };
    };
  };
}
