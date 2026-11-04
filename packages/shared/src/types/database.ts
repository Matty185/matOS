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
      announcements: {
        Row: {
          body: string | null;
          created_at: string;
          created_by: string | null;
          gym_id: string;
          id: string;
          show_until: string;
          title: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          created_by?: string | null;
          gym_id: string;
          id?: string;
          show_until: string;
          title: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          created_by?: string | null;
          gym_id?: string;
          id?: string;
          show_until?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "announcements_gym_id_fkey";
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
      class_session_changes: {
        Row: {
          class_id: string;
          created_at: string;
          gym_id: string;
          id: string;
          kind: Database["public"]["Enums"]["class_session_change_kind"];
          new_date: string | null;
          new_start_time: string | null;
          note: string | null;
          session_date: string;
        };
        Insert: {
          class_id: string;
          created_at?: string;
          gym_id: string;
          id?: string;
          kind: Database["public"]["Enums"]["class_session_change_kind"];
          new_date?: string | null;
          new_start_time?: string | null;
          note?: string | null;
          session_date: string;
        };
        Update: {
          class_id?: string;
          created_at?: string;
          gym_id?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["class_session_change_kind"];
          new_date?: string | null;
          new_start_time?: string | null;
          note?: string | null;
          session_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "class_session_changes_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_session_changes_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
        ];
      };
      classes: {
        Row: {
          active: boolean;
          class_type: Database["public"]["Enums"]["class_type"];
          coach_member_id: string | null;
          day_of_week: number;
          duration_minutes: number;
          gym_id: string;
          id: string;
          max_capacity: number | null;
          name: string;
          program: Database["public"]["Enums"]["class_program"];
          start_time: string;
        };
        Insert: {
          active?: boolean;
          class_type: Database["public"]["Enums"]["class_type"];
          coach_member_id?: string | null;
          day_of_week: number;
          duration_minutes: number;
          gym_id: string;
          id?: string;
          max_capacity?: number | null;
          name: string;
          program?: Database["public"]["Enums"]["class_program"];
          start_time: string;
        };
        Update: {
          active?: boolean;
          class_type?: Database["public"]["Enums"]["class_type"];
          coach_member_id?: string | null;
          day_of_week?: number;
          duration_minutes?: number;
          gym_id?: string;
          id?: string;
          max_capacity?: number | null;
          name?: string;
          program?: Database["public"]["Enums"]["class_program"];
          start_time?: string;
        };
        Relationships: [
          {
            foreignKeyName: "classes_coach_member_id_fkey";
            columns: ["coach_member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
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
      drop_in_visits: {
        Row: {
          belt: Database["public"]["Enums"]["belt_color"] | null;
          class_id: string | null;
          created_at: string;
          created_by: string | null;
          email: string | null;
          fee: number | null;
          fee_paid: boolean;
          first_name: string;
          gym_id: string;
          home_gym: string | null;
          id: string;
          last_name: string;
          phone: string | null;
          visit_date: string;
          waiver_method: string;
          waiver_signer_name: string | null;
          waiver_version_id: string | null;
        };
        Insert: {
          belt?: Database["public"]["Enums"]["belt_color"] | null;
          class_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          fee?: number | null;
          fee_paid?: boolean;
          first_name: string;
          gym_id: string;
          home_gym?: string | null;
          id?: string;
          last_name: string;
          phone?: string | null;
          visit_date: string;
          waiver_method?: string;
          waiver_signer_name?: string | null;
          waiver_version_id?: string | null;
        };
        Update: {
          belt?: Database["public"]["Enums"]["belt_color"] | null;
          class_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          fee?: number | null;
          fee_paid?: boolean;
          first_name?: string;
          gym_id?: string;
          home_gym?: string | null;
          id?: string;
          last_name?: string;
          phone?: string | null;
          visit_date?: string;
          waiver_method?: string;
          waiver_signer_name?: string | null;
          waiver_version_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "drop_in_visits_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "drop_in_visits_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "drop_in_visits_waiver_version_id_fkey";
            columns: ["waiver_version_id"];
            isOneToOne: false;
            referencedRelation: "waiver_versions";
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
      gym_plans: {
        Row: {
          active: boolean;
          created_at: string;
          gym_id: string;
          id: string;
          kind: Database["public"]["Enums"]["membership_plan"];
          name: string;
          payment_link_url: string | null;
          price: number | null;
          sort_order: number;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          gym_id: string;
          id?: string;
          kind: Database["public"]["Enums"]["membership_plan"];
          name: string;
          payment_link_url?: string | null;
          price?: number | null;
          sort_order?: number;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          gym_id?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["membership_plan"];
          name?: string;
          payment_link_url?: string | null;
          price?: number | null;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "gym_plans_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
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
          drop_in_fee: number | null;
          id: string;
          kind: Database["public"]["Enums"]["gym_kind"];
          logo_url: string | null;
          name: string;
          onboarding_completed_at: string | null;
          payments_tracked_from: string | null;
          promotion_classes_per_stripe: number | null;
          promotion_months_per_stripe: number | null;
          sibling_discount_percent: number;
          timezone: string;
          trial_code: string | null;
        };
        Insert: {
          active?: boolean;
          address?: string | null;
          contact_email?: string | null;
          created_at?: string;
          drop_in_fee?: number | null;
          id?: string;
          kind?: Database["public"]["Enums"]["gym_kind"];
          logo_url?: string | null;
          name: string;
          onboarding_completed_at?: string | null;
          payments_tracked_from?: string | null;
          promotion_classes_per_stripe?: number | null;
          promotion_months_per_stripe?: number | null;
          sibling_discount_percent?: number;
          timezone?: string;
          trial_code?: string | null;
        };
        Update: {
          active?: boolean;
          address?: string | null;
          contact_email?: string | null;
          created_at?: string;
          drop_in_fee?: number | null;
          id?: string;
          kind?: Database["public"]["Enums"]["gym_kind"];
          logo_url?: string | null;
          name?: string;
          onboarding_completed_at?: string | null;
          payments_tracked_from?: string | null;
          promotion_classes_per_stripe?: number | null;
          promotion_months_per_stripe?: number | null;
          sibling_discount_percent?: number;
          timezone?: string;
          trial_code?: string | null;
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
      kiosk_devices: {
        Row: {
          activated_at: string | null;
          activation_expires_at: string | null;
          activation_token_hash: string | null;
          created_at: string;
          created_by: string | null;
          device_token_hash: string | null;
          gym_id: string;
          id: string;
          last_seen_at: string | null;
          name: string;
          revoked_at: string | null;
        };
        Insert: {
          activated_at?: string | null;
          activation_expires_at?: string | null;
          activation_token_hash?: string | null;
          created_at?: string;
          created_by?: string | null;
          device_token_hash?: string | null;
          gym_id: string;
          id?: string;
          last_seen_at?: string | null;
          name: string;
          revoked_at?: string | null;
        };
        Update: {
          activated_at?: string | null;
          activation_expires_at?: string | null;
          activation_token_hash?: string | null;
          created_at?: string;
          created_by?: string | null;
          device_token_hash?: string | null;
          gym_id?: string;
          id?: string;
          last_seen_at?: string | null;
          name?: string;
          revoked_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "kiosk_devices_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
        ];
      };
      member_guardians: {
        Row: {
          child_member_id: string;
          created_at: string;
          created_by: string | null;
          guardian_member_id: string;
          gym_id: string;
          id: string;
        };
        Insert: {
          child_member_id: string;
          created_at?: string;
          created_by?: string | null;
          guardian_member_id: string;
          gym_id: string;
          id?: string;
        };
        Update: {
          child_member_id?: string;
          created_at?: string;
          created_by?: string | null;
          guardian_member_id?: string;
          gym_id?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "member_guardians_child_member_id_fkey";
            columns: ["child_member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "member_guardians_guardian_member_id_fkey";
            columns: ["guardian_member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "member_guardians_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
        ];
      };
      members: {
        Row: {
          active: boolean;
          belt: Database["public"]["Enums"]["belt_color"];
          created_at: string;
          email: string | null;
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
          plan_id: string | null;
          role: Database["public"]["Enums"]["member_role"];
          stripes: number;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          active?: boolean;
          belt?: Database["public"]["Enums"]["belt_color"];
          created_at?: string;
          email?: string | null;
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
          plan_id?: string | null;
          role?: Database["public"]["Enums"]["member_role"];
          stripes?: number;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          active?: boolean;
          belt?: Database["public"]["Enums"]["belt_color"];
          created_at?: string;
          email?: string | null;
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
          plan_id?: string | null;
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
          {
            foreignKeyName: "members_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "gym_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      membership_holds: {
        Row: {
          created_at: string;
          created_by: string | null;
          end_month: string;
          gym_id: string;
          id: string;
          member_id: string;
          start_month: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          end_month: string;
          gym_id: string;
          id?: string;
          member_id: string;
          start_month: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          end_month?: string;
          gym_id?: string;
          id?: string;
          member_id?: string;
          start_month?: string;
        };
        Relationships: [
          {
            foreignKeyName: "membership_holds_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "membership_holds_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
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
      trial_leads: {
        Row: {
          class_id: string | null;
          coach_notes: string | null;
          consented_at: string;
          contact_key: string;
          converted_member_id: string | null;
          created_at: string;
          email: string | null;
          experience: Database["public"]["Enums"]["trial_experience"];
          first_name: string;
          for_child: boolean;
          gym_id: string;
          id: string;
          last_name: string;
          message: string | null;
          parent_name: string | null;
          phone: string | null;
          session_date: string | null;
          source_hash: string | null;
          status: Database["public"]["Enums"]["trial_lead_status"];
          updated_at: string;
        };
        Insert: {
          class_id?: string | null;
          coach_notes?: string | null;
          consented_at?: string;
          contact_key: string;
          converted_member_id?: string | null;
          created_at?: string;
          email?: string | null;
          experience: Database["public"]["Enums"]["trial_experience"];
          first_name: string;
          for_child?: boolean;
          gym_id: string;
          id?: string;
          last_name: string;
          message?: string | null;
          parent_name?: string | null;
          phone?: string | null;
          session_date?: string | null;
          source_hash?: string | null;
          status?: Database["public"]["Enums"]["trial_lead_status"];
          updated_at?: string;
        };
        Update: {
          class_id?: string | null;
          coach_notes?: string | null;
          consented_at?: string;
          contact_key?: string;
          converted_member_id?: string | null;
          created_at?: string;
          email?: string | null;
          experience?: Database["public"]["Enums"]["trial_experience"];
          first_name?: string;
          for_child?: boolean;
          gym_id?: string;
          id?: string;
          last_name?: string;
          message?: string | null;
          parent_name?: string | null;
          phone?: string | null;
          session_date?: string | null;
          source_hash?: string | null;
          status?: Database["public"]["Enums"]["trial_lead_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trial_leads_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trial_leads_converted_member_id_fkey";
            columns: ["converted_member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trial_leads_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
        ];
      };
      waiver_signatures: {
        Row: {
          created_by: string | null;
          gym_id: string;
          id: string;
          member_id: string;
          method: Database["public"]["Enums"]["waiver_signature_method"];
          signed_at: string;
          signer_name: string | null;
          voided_at: string | null;
          voided_by: string | null;
          waiver_version_id: string;
        };
        Insert: {
          created_by?: string | null;
          gym_id: string;
          id?: string;
          member_id: string;
          method: Database["public"]["Enums"]["waiver_signature_method"];
          signed_at?: string;
          signer_name?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
          waiver_version_id: string;
        };
        Update: {
          created_by?: string | null;
          gym_id?: string;
          id?: string;
          member_id?: string;
          method?: Database["public"]["Enums"]["waiver_signature_method"];
          signed_at?: string;
          signer_name?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
          waiver_version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "waiver_signatures_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "waiver_signatures_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "waiver_signatures_waiver_version_id_fkey";
            columns: ["waiver_version_id"];
            isOneToOne: false;
            referencedRelation: "waiver_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      waiver_versions: {
        Row: {
          body: string;
          created_at: string;
          created_by: string | null;
          gym_id: string;
          id: string;
          version: number;
        };
        Insert: {
          body: string;
          created_at?: string;
          created_by?: string | null;
          gym_id: string;
          id?: string;
          version: number;
        };
        Update: {
          body?: string;
          created_at?: string;
          created_by?: string | null;
          gym_id?: string;
          id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "waiver_versions_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_guardian: {
        Args: {
          p_child_member_id: string;
          p_email: string;
          p_first_name: string;
          p_last_name: string;
        };
        Returns: {
          created: boolean;
          guardian_member_id: string;
        }[];
      };
      class_headcounts: {
        Args: { p_date: string };
        Returns: {
          class_id: string;
          headcount: number;
        }[];
      };
      class_coach_names: {
        Args: never;
        Returns: {
          class_id: string;
          coach_name: string;
        }[];
      };
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
      promotion_progress: {
        Args: { p_member_id?: string };
        Returns: {
          classes_since: number;
          last_is_initial: boolean;
          last_promoted_at: string;
          member_id: string;
        }[];
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
      checked_in_by: "self" | "coach" | "kiosk" | "guardian";
      class_program: "all_levels" | "fundamentals" | "advanced" | "kids" | "teens" | "womens";
      class_session_change_kind: "cancelled" | "moved";
      class_type: "gi" | "no_gi" | "comp" | "open_mat";
      entitlement_plan: "solo" | "gym";
      entitlement_source: "iap_apple" | "iap_google" | "stripe" | "manual";
      entitlement_status: "active" | "trialing" | "canceled" | "expired";
      gym_kind: "gym" | "personal";
      initiated_by: "coach_manual" | "agent" | "self_service" | "kiosk";
      member_role: "gym_owner" | "coach" | "athlete" | "guardian";
      membership_plan: "monthly" | "casual" | "comp_team";
      payment_status: "paid" | "unpaid" | "waived";
      push_platform: "ios" | "android";
      share_link_type: "profile" | "breakdown";
      trial_experience: "none" | "some" | "experienced";
      trial_lead_status:
        "new" | "contacted" | "booked" | "attended" | "converted" | "not_interested";
      waiver_signature_method: "self" | "guardian" | "paper";
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
      checked_in_by: ["self", "coach", "kiosk", "guardian"],
      class_program: ["all_levels", "fundamentals", "advanced", "kids", "teens", "womens"],
      class_session_change_kind: ["cancelled", "moved"],
      class_type: ["gi", "no_gi", "comp", "open_mat"],
      entitlement_plan: ["solo", "gym"],
      entitlement_source: ["iap_apple", "iap_google", "stripe", "manual"],
      entitlement_status: ["active", "trialing", "canceled", "expired"],
      gym_kind: ["gym", "personal"],
      initiated_by: ["coach_manual", "agent", "self_service", "kiosk"],
      member_role: ["gym_owner", "coach", "athlete", "guardian"],
      membership_plan: ["monthly", "casual", "comp_team"],
      payment_status: ["paid", "unpaid", "waived"],
      push_platform: ["ios", "android"],
      share_link_type: ["profile", "breakdown"],
      trial_experience: ["none", "some", "experienced"],
      trial_lead_status: ["new", "contacted", "booked", "attended", "converted", "not_interested"],
      waiver_signature_method: ["self", "guardian", "paper"],
    },
  },
} as const;
