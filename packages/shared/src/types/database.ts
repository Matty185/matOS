export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      agent_rate_limits: {
        Row: {
          date: string;
          gym_id: string;
          query_count: number;
          user_id: string;
        };
        Insert: {
          date?: string;
          gym_id: string;
          query_count?: number;
          user_id: string;
        };
        Update: {
          date?: string;
          gym_id?: string;
          query_count?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_rate_limits_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
        ];
      };
      athlete_logs: {
        Row: {
          created_at: string;
          entry_date: string;
          gym_id: string;
          id: string;
          member_id: string;
          notes: string | null;
          struggling_with: string | null;
          updated_at: string;
          visible_to_coach: boolean;
          working_on: string | null;
        };
        Insert: {
          created_at?: string;
          entry_date?: string;
          gym_id: string;
          id?: string;
          member_id: string;
          notes?: string | null;
          struggling_with?: string | null;
          updated_at?: string;
          visible_to_coach?: boolean;
          working_on?: string | null;
        };
        Update: {
          created_at?: string;
          entry_date?: string;
          gym_id?: string;
          id?: string;
          member_id?: string;
          notes?: string | null;
          struggling_with?: string | null;
          updated_at?: string;
          visible_to_coach?: boolean;
          working_on?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "athlete_logs_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "athlete_logs_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      attendance: {
        Row: {
          checked_in_at: string;
          checked_in_by: Database["public"]["Enums"]["checked_in_by"];
          checked_in_date: string;
          class_id: string;
          gym_id: string;
          id: string;
          member_id: string;
          offline_queued: boolean;
        };
        Insert: {
          checked_in_at?: string;
          checked_in_by: Database["public"]["Enums"]["checked_in_by"];
          checked_in_date: string;
          class_id: string;
          gym_id: string;
          id?: string;
          member_id: string;
          offline_queued?: boolean;
        };
        Update: {
          checked_in_at?: string;
          checked_in_by?: Database["public"]["Enums"]["checked_in_by"];
          checked_in_date?: string;
          class_id?: string;
          gym_id?: string;
          id?: string;
          member_id?: string;
          offline_queued?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          after_state: Json | null;
          agent_query: string | null;
          before_state: Json | null;
          entity_id: string | null;
          entity_type: string;
          gym_id: string;
          id: string;
          initiated_by: Database["public"]["Enums"]["initiated_by"];
          timestamp: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          after_state?: Json | null;
          agent_query?: string | null;
          before_state?: Json | null;
          entity_id?: string | null;
          entity_type: string;
          gym_id: string;
          id?: string;
          initiated_by?: Database["public"]["Enums"]["initiated_by"];
          timestamp?: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          after_state?: Json | null;
          agent_query?: string | null;
          before_state?: Json | null;
          entity_id?: string | null;
          entity_type?: string;
          gym_id?: string;
          id?: string;
          initiated_by?: Database["public"]["Enums"]["initiated_by"];
          timestamp?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
        ];
      };
      belt_history: {
        Row: {
          belt: Database["public"]["Enums"]["belt_color"];
          gym_id: string;
          id: string;
          is_initial: boolean;
          member_id: string;
          notes: string | null;
          promoted_at: string;
          promoted_by: string | null;
          stripes: number;
        };
        Insert: {
          belt: Database["public"]["Enums"]["belt_color"];
          gym_id: string;
          id?: string;
          is_initial?: boolean;
          member_id: string;
          notes?: string | null;
          promoted_at?: string;
          promoted_by?: string | null;
          stripes?: number;
        };
        Update: {
          belt?: Database["public"]["Enums"]["belt_color"];
          gym_id?: string;
          id?: string;
          is_initial?: boolean;
          member_id?: string;
          notes?: string | null;
          promoted_at?: string;
          promoted_by?: string | null;
          stripes?: number;
        };
        Relationships: [
          {
            foreignKeyName: "belt_history_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "belt_history_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      breakdown_events: {
        Row: {
          breakdown_id: string;
          client_id: string | null;
          created_at: string;
          event_type_id: string;
          gym_id: string;
          id: string;
          modifier: string | null;
          outcome: string | null;
          source: Database["public"]["Enums"]["breakdown_event_source"];
          ts: number;
        };
        Insert: {
          breakdown_id: string;
          client_id?: string | null;
          created_at?: string;
          event_type_id: string;
          gym_id: string;
          id?: string;
          modifier?: string | null;
          outcome?: string | null;
          source?: Database["public"]["Enums"]["breakdown_event_source"];
          ts: number;
        };
        Update: {
          breakdown_id?: string;
          client_id?: string | null;
          created_at?: string;
          event_type_id?: string;
          gym_id?: string;
          id?: string;
          modifier?: string | null;
          outcome?: string | null;
          source?: Database["public"]["Enums"]["breakdown_event_source"];
          ts?: number;
        };
        Relationships: [
          {
            foreignKeyName: "breakdown_events_breakdown_id_fkey";
            columns: ["breakdown_id"];
            isOneToOne: false;
            referencedRelation: "breakdowns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "breakdown_events_event_type_id_fkey";
            columns: ["event_type_id"];
            isOneToOne: false;
            referencedRelation: "event_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "breakdown_events_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
        ];
      };
      breakdown_positions: {
        Row: {
          breakdown_id: string;
          client_id: string | null;
          end_ts: number | null;
          gym_id: string;
          id: string;
          position_id: string;
          role: string | null;
          start_ts: number;
        };
        Insert: {
          breakdown_id: string;
          client_id?: string | null;
          end_ts?: number | null;
          gym_id: string;
          id?: string;
          position_id: string;
          role?: string | null;
          start_ts: number;
        };
        Update: {
          breakdown_id?: string;
          client_id?: string | null;
          end_ts?: number | null;
          gym_id?: string;
          id?: string;
          position_id?: string;
          role?: string | null;
          start_ts?: number;
        };
        Relationships: [
          {
            foreignKeyName: "breakdown_positions_breakdown_id_fkey";
            columns: ["breakdown_id"];
            isOneToOne: false;
            referencedRelation: "breakdowns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "breakdown_positions_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "breakdown_positions_position_id_fkey";
            columns: ["position_id"];
            isOneToOne: false;
            referencedRelation: "positions";
            referencedColumns: ["id"];
          },
        ];
      };
      breakdowns: {
        Row: {
          author_id: string | null;
          created_at: string;
          duration_seconds: number | null;
          external_person_id: string | null;
          gi: boolean;
          gym_id: string;
          id: string;
          match_date: string;
          member_id: string | null;
          method: Database["public"]["Enums"]["breakdown_method"] | null;
          name: string;
          result: Database["public"]["Enums"]["breakdown_result"] | null;
          status: Database["public"]["Enums"]["breakdown_status"];
          updated_at: string;
          video_duration_seconds: number | null;
          video_filename: string | null;
          visibility: Database["public"]["Enums"]["breakdown_visibility"];
        };
        Insert: {
          author_id?: string | null;
          created_at?: string;
          duration_seconds?: number | null;
          external_person_id?: string | null;
          gi: boolean;
          gym_id: string;
          id?: string;
          match_date: string;
          member_id?: string | null;
          method?: Database["public"]["Enums"]["breakdown_method"] | null;
          name: string;
          result?: Database["public"]["Enums"]["breakdown_result"] | null;
          status?: Database["public"]["Enums"]["breakdown_status"];
          updated_at?: string;
          video_duration_seconds?: number | null;
          video_filename?: string | null;
          visibility?: Database["public"]["Enums"]["breakdown_visibility"];
        };
        Update: {
          author_id?: string | null;
          created_at?: string;
          duration_seconds?: number | null;
          external_person_id?: string | null;
          gi?: boolean;
          gym_id?: string;
          id?: string;
          match_date?: string;
          member_id?: string | null;
          method?: Database["public"]["Enums"]["breakdown_method"] | null;
          name?: string;
          result?: Database["public"]["Enums"]["breakdown_result"] | null;
          status?: Database["public"]["Enums"]["breakdown_status"];
          updated_at?: string;
          video_duration_seconds?: number | null;
          video_filename?: string | null;
          visibility?: Database["public"]["Enums"]["breakdown_visibility"];
        };
        Relationships: [
          {
            foreignKeyName: "breakdowns_external_person_id_fkey";
            columns: ["external_person_id"];
            isOneToOne: false;
            referencedRelation: "external_people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "breakdowns_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "breakdowns_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      classes: {
        Row: {
          active: boolean;
          class_type: Database["public"]["Enums"]["class_type"];
          day_of_week: number;
          duration_minutes: number;
          gym_id: string;
          id: string;
          max_capacity: number | null;
          name: string;
          start_time: string;
        };
        Insert: {
          active?: boolean;
          class_type: Database["public"]["Enums"]["class_type"];
          day_of_week: number;
          duration_minutes: number;
          gym_id: string;
          id?: string;
          max_capacity?: number | null;
          name: string;
          start_time: string;
        };
        Update: {
          active?: boolean;
          class_type?: Database["public"]["Enums"]["class_type"];
          day_of_week?: number;
          duration_minutes?: number;
          gym_id?: string;
          id?: string;
          max_capacity?: number | null;
          name?: string;
          start_time?: string;
        };
        Relationships: [
          {
            foreignKeyName: "classes_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
        ];
      };
      deletion_requests: {
        Row: {
          executed_at: string | null;
          executed_by: string | null;
          gym_id: string;
          id: string;
          member_id: string;
          requested_at: string;
        };
        Insert: {
          executed_at?: string | null;
          executed_by?: string | null;
          gym_id: string;
          id?: string;
          member_id: string;
          requested_at?: string;
        };
        Update: {
          executed_at?: string | null;
          executed_by?: string | null;
          gym_id?: string;
          id?: string;
          member_id?: string;
          requested_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deletion_requests_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deletion_requests_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      entitlements: {
        Row: {
          created_at: string;
          current_period_end: string | null;
          id: string;
          plan: Database["public"]["Enums"]["entitlement_plan"];
          source: Database["public"]["Enums"]["entitlement_source"];
          status: Database["public"]["Enums"]["entitlement_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          current_period_end?: string | null;
          id?: string;
          plan: Database["public"]["Enums"]["entitlement_plan"];
          source: Database["public"]["Enums"]["entitlement_source"];
          status?: Database["public"]["Enums"]["entitlement_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          current_period_end?: string | null;
          id?: string;
          plan?: Database["public"]["Enums"]["entitlement_plan"];
          source?: Database["public"]["Enums"]["entitlement_source"];
          status?: Database["public"]["Enums"]["entitlement_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      event_types: {
        Row: {
          active: boolean;
          category: string;
          id: string;
          modifier_options: Json | null;
          modifier_required: boolean;
          name: string;
          outcome_options: Json | null;
          outcome_required: boolean;
        };
        Insert: {
          active?: boolean;
          category: string;
          id?: string;
          modifier_options?: Json | null;
          modifier_required?: boolean;
          name: string;
          outcome_options?: Json | null;
          outcome_required?: boolean;
        };
        Update: {
          active?: boolean;
          category?: string;
          id?: string;
          modifier_options?: Json | null;
          modifier_required?: boolean;
          name?: string;
          outcome_options?: Json | null;
          outcome_required?: boolean;
        };
        Relationships: [];
      };
      external_people: {
        Row: {
          created_at: string;
          created_by: string | null;
          display_name: string;
          gym_id: string;
          id: string;
          notes: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          display_name: string;
          gym_id: string;
          id?: string;
          notes?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          display_name?: string;
          gym_id?: string;
          id?: string;
          notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "external_people_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
        ];
      };
      gdpr_consents: {
        Row: {
          consent_version: string;
          consented_at: string | null;
          data_storage_consent: boolean;
          gym_id: string;
          member_id: string;
        };
        Insert: {
          consent_version: string;
          consented_at?: string | null;
          data_storage_consent?: boolean;
          gym_id: string;
          member_id: string;
        };
        Update: {
          consent_version?: string;
          consented_at?: string | null;
          data_storage_consent?: boolean;
          gym_id?: string;
          member_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "gdpr_consents_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gdpr_consents_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: true;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      gyms: {
        Row: {
          active: boolean;
          address: string | null;
          contact_email: string | null;
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["gym_kind"];
          logo_url: string | null;
          name: string;
          onboarding_completed_at: string | null;
          payments_tracked_from: string | null;
          timezone: string;
        };
        Insert: {
          active?: boolean;
          address?: string | null;
          contact_email?: string | null;
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["gym_kind"];
          logo_url?: string | null;
          name: string;
          onboarding_completed_at?: string | null;
          payments_tracked_from?: string | null;
          timezone?: string;
        };
        Update: {
          active?: boolean;
          address?: string | null;
          contact_email?: string | null;
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["gym_kind"];
          logo_url?: string | null;
          name?: string;
          onboarding_completed_at?: string | null;
          payments_tracked_from?: string | null;
          timezone?: string;
        };
        Relationships: [];
      };
      invites: {
        Row: {
          attempt_count: number;
          claimed_at: string | null;
          created_at: string;
          created_by: string | null;
          expires_at: string;
          gym_id: string;
          id: string;
          member_id: string;
          token_hash: string;
        };
        Insert: {
          attempt_count?: number;
          claimed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          expires_at: string;
          gym_id: string;
          id?: string;
          member_id: string;
          token_hash: string;
        };
        Update: {
          attempt_count?: number;
          claimed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          gym_id?: string;
          id?: string;
          member_id?: string;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invites_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invites_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      members: {
        Row: {
          active: boolean;
          belt: Database["public"]["Enums"]["belt_color"];
          created_at: string;
          email: string;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          first_name: string;
          gym_id: string;
          id: string;
          join_date: string;
          last_name: string;
          membership_plan: Database["public"]["Enums"]["membership_plan"];
          notes: string | null;
          phone: string | null;
          photo_url: string | null;
          role: Database["public"]["Enums"]["member_role"];
          stripes: number;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          active?: boolean;
          belt?: Database["public"]["Enums"]["belt_color"];
          created_at?: string;
          email: string;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          first_name: string;
          gym_id: string;
          id?: string;
          join_date?: string;
          last_name: string;
          membership_plan?: Database["public"]["Enums"]["membership_plan"];
          notes?: string | null;
          phone?: string | null;
          photo_url?: string | null;
          role?: Database["public"]["Enums"]["member_role"];
          stripes?: number;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          active?: boolean;
          belt?: Database["public"]["Enums"]["belt_color"];
          created_at?: string;
          email?: string;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          first_name?: string;
          gym_id?: string;
          id?: string;
          join_date?: string;
          last_name?: string;
          membership_plan?: Database["public"]["Enums"]["membership_plan"];
          notes?: string | null;
          phone?: string | null;
          photo_url?: string | null;
          role?: Database["public"]["Enums"]["member_role"];
          stripes?: number;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "members_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
        ];
      };
      memberships: {
        Row: {
          active: boolean;
          created_at: string;
          gym_id: string;
          id: string;
          is_current: boolean;
          joined_at: string;
          role: Database["public"]["Enums"]["member_role"];
          user_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          gym_id: string;
          id?: string;
          is_current?: boolean;
          joined_at?: string;
          role: Database["public"]["Enums"]["member_role"];
          user_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          gym_id?: string;
          id?: string;
          is_current?: boolean;
          joined_at?: string;
          role?: Database["public"]["Enums"]["member_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          created_at: string;
          gym_id: string;
          id: string;
          payload: Json | null;
          read: boolean;
          recipient_user_id: string;
          type: string;
        };
        Insert: {
          created_at?: string;
          gym_id: string;
          id?: string;
          payload?: Json | null;
          read?: boolean;
          recipient_user_id: string;
          type: string;
        };
        Update: {
          created_at?: string;
          gym_id?: string;
          id?: string;
          payload?: Json | null;
          read?: boolean;
          recipient_user_id?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number | null;
          created_at: string;
          gym_id: string;
          id: string;
          member_id: string;
          notes: string | null;
          paid_at: string | null;
          period_month: number;
          period_year: number;
          recorded_by: string | null;
          status: Database["public"]["Enums"]["payment_status"];
        };
        Insert: {
          amount?: number | null;
          created_at?: string;
          gym_id: string;
          id?: string;
          member_id: string;
          notes?: string | null;
          paid_at?: string | null;
          period_month: number;
          period_year: number;
          recorded_by?: string | null;
          status?: Database["public"]["Enums"]["payment_status"];
        };
        Update: {
          amount?: number | null;
          created_at?: string;
          gym_id?: string;
          id?: string;
          member_id?: string;
          notes?: string | null;
          paid_at?: string | null;
          period_month?: number;
          period_year?: number;
          recorded_by?: string | null;
          status?: Database["public"]["Enums"]["payment_status"];
        };
        Relationships: [
          {
            foreignKeyName: "payments_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      positions: {
        Row: {
          active: boolean;
          id: string;
          name: string;
          notes: string | null;
          roles: Json | null;
        };
        Insert: {
          active?: boolean;
          id?: string;
          name: string;
          notes?: string | null;
          roles?: Json | null;
        };
        Update: {
          active?: boolean;
          id?: string;
          name?: string;
          notes?: string | null;
          roles?: Json | null;
        };
        Relationships: [];
      };
      push_tokens: {
        Row: {
          created_at: string;
          expo_push_token: string;
          gym_id: string;
          id: string;
          member_id: string;
          platform: Database["public"]["Enums"]["push_platform"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          expo_push_token: string;
          gym_id: string;
          id?: string;
          member_id: string;
          platform: Database["public"]["Enums"]["push_platform"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          expo_push_token?: string;
          gym_id?: string;
          id?: string;
          member_id?: string;
          platform?: Database["public"]["Enums"]["push_platform"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_tokens_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "push_tokens_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      share_links: {
        Row: {
          created_at: string;
          created_by: string;
          gym_id: string;
          id: string;
          redact_opponents: boolean;
          revoked: boolean;
          subject_id: string;
          token_hash: string;
          type: Database["public"]["Enums"]["share_link_type"];
        };
        Insert: {
          created_at?: string;
          created_by: string;
          gym_id: string;
          id?: string;
          redact_opponents?: boolean;
          revoked?: boolean;
          subject_id: string;
          token_hash: string;
          type: Database["public"]["Enums"]["share_link_type"];
        };
        Update: {
          created_at?: string;
          created_by?: string;
          gym_id?: string;
          id?: string;
          redact_opponents?: boolean;
          revoked?: boolean;
          subject_id?: string;
          token_hash?: string;
          type?: Database["public"]["Enums"]["share_link_type"];
        };
        Relationships: [
          {
            foreignKeyName: "share_links_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
        ];
      };
      signup_links: {
        Row: {
          attempt_count: number;
          created_at: string;
          created_by: string | null;
          expires_at: string;
          gym_id: string;
          id: string;
          token_hash: string;
          used_at: string | null;
          used_by_member_id: string | null;
        };
        Insert: {
          attempt_count?: number;
          created_at?: string;
          created_by?: string | null;
          expires_at: string;
          gym_id: string;
          id?: string;
          token_hash: string;
          used_at?: string | null;
          used_by_member_id?: string | null;
        };
        Update: {
          attempt_count?: number;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          gym_id?: string;
          id?: string;
          token_hash?: string;
          used_at?: string | null;
          used_by_member_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "signup_links_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "signup_links_used_by_member_id_fkey";
            columns: ["used_by_member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      current_member: {
        Args: never;
        Returns: {
          first_name: string;
          gym_id: string;
          gym_kind: Database["public"]["Enums"]["gym_kind"];
          id: string;
          last_name: string;
          role: Database["public"]["Enums"]["member_role"];
          user_id: string;
        }[];
      };
      import_members: {
        Args: {
          p_gym_id: string;
          p_role: Database["public"]["Enums"]["member_role"];
          p_rows: Json;
        };
        Returns: {
          email: string;
          id: string;
        }[];
      };
      increment_agent_query_count: {
        Args: { p_date: string; p_gym_id: string };
        Returns: number;
      };
      increment_invite_attempt: { Args: { invite_id: string }; Returns: number };
      increment_signup_link_attempt: {
        Args: { p_link_id: string };
        Returns: number;
      };
      redeem_signup_link: {
        Args: {
          p_consent_version: string;
          p_details: Json;
          p_link_id: string;
          p_user_id: string;
        };
        Returns: string;
      };
      set_active_gym: { Args: { p_gym_id: string }; Returns: undefined };
      tag_position: {
        Args: {
          p_breakdown_id: string;
          p_client_id?: string;
          p_position_id: string;
          p_role: string;
          p_start_ts: number;
        };
        Returns: {
          breakdown_id: string;
          client_id: string | null;
          end_ts: number | null;
          gym_id: string;
          id: string;
          position_id: string;
          role: string | null;
          start_ts: number;
        };
        SetofOptions: {
          from: "*";
          to: "breakdown_positions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      belt_color:
        | "white"
        | "grey_white"
        | "grey"
        | "grey_black"
        | "yellow_white"
        | "yellow"
        | "yellow_black"
        | "orange_white"
        | "orange"
        | "orange_black"
        | "green_white"
        | "green"
        | "green_black"
        | "blue"
        | "purple"
        | "brown"
        | "black";
      breakdown_event_source: "manual" | "ai";
      breakdown_method: "submission" | "points" | "decision" | "dq";
      breakdown_result: "win" | "loss" | "draw";
      breakdown_status: "in_progress" | "complete";
      breakdown_visibility: "private" | "gym";
      checked_in_by: "self" | "coach";
      class_type: "gi" | "no_gi" | "comp" | "open_mat";
      entitlement_plan: "solo" | "gym";
      entitlement_source: "iap_apple" | "iap_google" | "stripe" | "manual";
      entitlement_status: "active" | "trialing" | "canceled" | "expired";
      gym_kind: "gym" | "personal";
      initiated_by: "coach_manual" | "agent" | "self_service";
      member_role: "gym_owner" | "coach" | "athlete";
      membership_plan: "monthly" | "casual" | "comp_team";
      payment_status: "paid" | "unpaid" | "waived";
      push_platform: "ios" | "android";
      share_link_type: "profile" | "breakdown";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      belt_color: [
        "white",
        "grey_white",
        "grey",
        "grey_black",
        "yellow_white",
        "yellow",
        "yellow_black",
        "orange_white",
        "orange",
        "orange_black",
        "green_white",
        "green",
        "green_black",
        "blue",
        "purple",
        "brown",
        "black",
      ],
      breakdown_event_source: ["manual", "ai"],
      breakdown_method: ["submission", "points", "decision", "dq"],
      breakdown_result: ["win", "loss", "draw"],
      breakdown_status: ["in_progress", "complete"],
      breakdown_visibility: ["private", "gym"],
      checked_in_by: ["self", "coach"],
      class_type: ["gi", "no_gi", "comp", "open_mat"],
      entitlement_plan: ["solo", "gym"],
      entitlement_source: ["iap_apple", "iap_google", "stripe", "manual"],
      entitlement_status: ["active", "trialing", "canceled", "expired"],
      gym_kind: ["gym", "personal"],
      initiated_by: ["coach_manual", "agent", "self_service"],
      member_role: ["gym_owner", "coach", "athlete"],
      membership_plan: ["monthly", "casual", "comp_team"],
      payment_status: ["paid", "unpaid", "waived"],
      push_platform: ["ios", "android"],
      share_link_type: ["profile", "breakdown"],
    },
  },
} as const;
