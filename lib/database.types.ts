export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_limits: {
        Row: {
          global_monthly_usd: number
          id: boolean
          ip_hourly_usd: number
          updated_at: string
        }
        Insert: {
          global_monthly_usd?: number
          id?: boolean
          ip_hourly_usd?: number
          updated_at?: string
        }
        Update: {
          global_monthly_usd?: number
          id?: boolean
          ip_hourly_usd?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_usage: {
        Row: {
          cache_creation_input_tokens: number
          cache_read_input_tokens: number
          cost_usd: number
          created_at: string
          feature: string
          id: number
          input_tokens: number
          ip_hash: string
          model: string
          output_tokens: number
          user_id: string | null
        }
        Insert: {
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          cost_usd: number
          created_at?: string
          feature?: string
          id?: never
          input_tokens?: number
          ip_hash: string
          model: string
          output_tokens?: number
          user_id?: string | null
        }
        Update: {
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          cost_usd?: number
          created_at?: string
          feature?: string
          id?: never
          input_tokens?: number
          ip_hash?: string
          model?: string
          output_tokens?: number
          user_id?: string | null
        }
        Relationships: []
      }
      demo_state: {
        Row: {
          anchored_on: string
          id: boolean
        }
        Insert: {
          anchored_on: string
          id?: boolean
        }
        Update: {
          anchored_on?: string
          id?: boolean
        }
        Relationships: []
      }
      farms: {
        Row: {
          created_at: string
          id: string
          name: string
          timezone: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          timezone?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          timezone?: string
        }
        Relationships: []
      }
      fields: {
        Row: {
          acres: number | null
          boundary: unknown
          centroid: unknown
          created_at: string
          crop: string | null
          farm_id: string
          id: string
          name: string
        }
        Insert: {
          acres?: number | null
          boundary: unknown
          centroid?: unknown
          created_at?: string
          crop?: string | null
          farm_id: string
          id?: string
          name: string
        }
        Update: {
          acres?: number | null
          boundary?: unknown
          centroid?: unknown
          created_at?: string
          crop?: string | null
          farm_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "fields_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "farms"
            referencedColumns: ["id"]
          },
        ]
      }
      log_answers: {
        Row: {
          answer: string | null
          id: string
          is_valid: boolean
          log_id: string
          position: number
          question: string
          question_key: string
        }
        Insert: {
          answer?: string | null
          id?: string
          is_valid: boolean
          log_id: string
          position: number
          question: string
          question_key: string
        }
        Update: {
          answer?: string | null
          id?: string
          is_valid?: boolean
          log_id?: string
          position?: number
          question?: string
          question_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "log_answers_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "log_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_answers_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "logs"
            referencedColumns: ["id"]
          },
        ]
      }
      log_reads: {
        Row: {
          log_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          log_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          log_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "log_reads_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "log_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_reads_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      log_tags: {
        Row: {
          created_at: string
          created_by: string | null
          log_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          log_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          log_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "log_tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_tags_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "log_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_tags_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      logs: {
        Row: {
          activity: Database["public"]["Enums"]["activity_type"]
          audio_mime: string | null
          audio_path: string | null
          created_at: string
          details: Json
          duration_s: number | null
          employee_id: string
          ended_at: string | null
          farm_id: string
          field_id: string | null
          id: string
          location: unknown
          source: string
          started_at: string
          summary: string | null
          transcript: string | null
          waveform_peaks: Json | null
        }
        Insert: {
          activity: Database["public"]["Enums"]["activity_type"]
          audio_mime?: string | null
          audio_path?: string | null
          created_at?: string
          details?: Json
          duration_s?: number | null
          employee_id: string
          ended_at?: string | null
          farm_id: string
          field_id?: string | null
          id?: string
          location?: unknown
          source?: string
          started_at: string
          summary?: string | null
          transcript?: string | null
          waveform_peaks?: Json | null
        }
        Update: {
          activity?: Database["public"]["Enums"]["activity_type"]
          audio_mime?: string | null
          audio_path?: string | null
          created_at?: string
          details?: Json
          duration_s?: number | null
          employee_id?: string
          ended_at?: string | null
          farm_id?: string
          field_id?: string | null
          id?: string
          location?: unknown
          source?: string
          started_at?: string
          summary?: string | null
          transcript?: string | null
          waveform_peaks?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logs_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "farms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logs_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          farm_id: string
          full_name: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          farm_id: string
          full_name: string
          id: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          farm_id?: string
          full_name?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "farms"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          farm_id: string
          id: string
          name: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          farm_id: string
          id?: string
          name: string
        }
        Update: {
          color?: string | null
          created_at?: string
          farm_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "farms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      log_feed: {
        Row: {
          activity: Database["public"]["Enums"]["activity_type"] | null
          answers: Json | null
          audio_mime: string | null
          audio_path: string | null
          created_at: string | null
          details: Json | null
          duration_s: number | null
          employee_avatar_url: string | null
          employee_id: string | null
          employee_name: string | null
          ended_at: string | null
          farm_id: string | null
          field_boundary: Json | null
          field_crop: string | null
          field_id: string | null
          field_name: string | null
          id: string | null
          is_new: boolean | null
          location_geojson: Json | null
          source: string | null
          started_at: string | null
          summary: string | null
          tags: Json | null
          transcript: string | null
          waveform_peaks: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logs_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "farms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logs_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      ai_budget_check: { Args: { p_ip_hash: string }; Returns: Json }
      ai_usage_record: {
        Args: {
          p_cache_read: number
          p_cache_write: number
          p_cost: number
          p_feature: string
          p_input: number
          p_ip_hash: string
          p_model: string
          p_output: number
          p_user_id: string
        }
        Returns: undefined
      }
      current_farm_id: { Args: never; Returns: string }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      dashboard_stats: { Args: never; Returns: Json }
      mark_logs_read: { Args: { p_log_ids: string[] }; Returns: undefined }
      refresh_demo_data: { Args: never; Returns: undefined }
    }
    Enums: {
      activity_type:
        | "spraying"
        | "fertilizing"
        | "planting"
        | "irrigating"
        | "harvesting"
        | "scouting"
        | "pruning"
        | "soil_work"
        | "equipment_maintenance"
      user_role: "admin" | "manager" | "worker"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      activity_type: [
        "spraying",
        "fertilizing",
        "planting",
        "irrigating",
        "harvesting",
        "scouting",
        "pruning",
        "soil_work",
        "equipment_maintenance",
      ],
      user_role: ["admin", "manager", "worker"],
    },
  },
} as const

