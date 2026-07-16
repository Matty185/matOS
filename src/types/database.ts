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
      analyses: {
        Row: {
          analysed_at: string | null;
          created_at: string;
          created_by: string | null;
          gym_id: string;
          id: string;
          member_id: string;
          report: Json | null;
          status: Database["public"]["Enums"]["analysis_status"];
          title: string;
          visible_to_athlete: boolean;
        };
        Insert: {
          analysed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          gym_id: string;
          id?: string;
          member_id: string;
          report?: Json | null;
          status?: Database["public"]["Enums"]["analysis_status"];
          title: string;
          visible_to_athlete?: boolean;
        };
        Update: {
          analysed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          gym_id?: string;
          id?: string;
          member_id?: string;
          report?: Json | null;
          status?: Database["public"]["Enums"]["analysis_status"];
          title?: string;
          visible_to_athlete?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "analyses_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "analyses_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
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
        };
        Insert: {
          checked_in_at?: string;
          checked_in_by: Database["public"]["Enums"]["checked_in_by"];
          checked_in_date: string;
          class_id: string;
          gym_id: string;
          id?: string;
          member_id: string;
        };
        Update: {
          checked_in_at?: string;
          checked_in_by?: Database["public"]["Enums"]["checked_in_by"];
          checked_in_date?: string;
          class_id?: string;
          gym_id?: string;
          id?: string;
          member_id?: string;
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
          logo_url: string | null;
          name: string;
        };
        Insert: {
          active?: boolean;
          address?: string | null;
          contact_email?: string | null;
          created_at?: string;
          id?: string;
          logo_url?: string | null;
          name: string;
        };
        Update: {
          active?: boolean;
          address?: string | null;
          contact_email?: string | null;
          created_at?: string;
          id?: string;
          logo_url?: string | null;
          name?: string;
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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      increment_invite_attempt: { Args: { invite_id: string }; Returns: number };
    };
    Enums: {
      analysis_status: "pending" | "complete" | "failed";
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
      checked_in_by: "self" | "coach";
      class_type: "gi" | "no_gi" | "comp" | "open_mat";
      initiated_by: "coach_manual" | "agent" | "self_service";
      member_role: "gym_owner" | "coach" | "athlete";
      membership_plan: "monthly" | "casual" | "comp_team";
      payment_status: "paid" | "unpaid" | "waived";
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
      analysis_status: ["pending", "complete", "failed"],
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
      checked_in_by: ["self", "coach"],
      class_type: ["gi", "no_gi", "comp", "open_mat"],
      initiated_by: ["coach_manual", "agent", "self_service"],
      member_role: ["gym_owner", "coach", "athlete"],
      membership_plan: ["monthly", "casual", "comp_team"],
      payment_status: ["paid", "unpaid", "waived"],
    },
  },
} as const;
