export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      orders: {
        Row: {
          activated_at: string | null;
          activation_code: string | null;
          amount_usd: number | null;
          created_at: string;
          customer_email: string;
          device_type: string;
          employee_id: string | null;
          esim_iccid: string | null;
          id: string;
          order_no: string | null;
          organization_id: string | null;
          package_code: string;
          payment_method: string;
          qr_code_url: string | null;
          raw_webhook_payload: Json | null;
          recipient_email: string | null;
          smdp_address: string | null;
          status: string;
          transaction_id: string | null;
          user_id: string | null;
        };
        Insert: {
          activated_at?: string | null;
          activation_code?: string | null;
          amount_usd?: number | null;
          created_at?: string;
          customer_email: string;
          device_type?: string;
          employee_id?: string | null;
          esim_iccid?: string | null;
          id?: string;
          order_no?: string | null;
          organization_id?: string | null;
          package_code: string;
          payment_method?: string;
          qr_code_url?: string | null;
          raw_webhook_payload?: Json | null;
          recipient_email?: string | null;
          smdp_address?: string | null;
          status?: string;
          transaction_id?: string | null;
          user_id?: string | null;
        };
        Update: {
          activated_at?: string | null;
          activation_code?: string | null;
          amount_usd?: number | null;
          created_at?: string;
          customer_email?: string;
          device_type?: string;
          employee_id?: string | null;
          esim_iccid?: string | null;
          id?: string;
          order_no?: string | null;
          organization_id?: string | null;
          package_code?: string;
          payment_method?: string;
          qr_code_url?: string | null;
          raw_webhook_payload?: Json | null;
          recipient_email?: string | null;
          smdp_address?: string | null;
          status?: string;
          transaction_id?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "orders_package_code_fkey";
            columns: ["package_code"];
            isOneToOne: false;
            referencedRelation: "packages";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "orders_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          company_email: string;
          owner_user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          company_email: string;
          owner_user_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          company_email?: string;
          owner_user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      offices: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "offices_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      employees: {
        Row: {
          id: string;
          organization_id: string;
          office_id: string | null;
          full_name: string;
          email: string;
          phone: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          office_id?: string | null;
          full_name: string;
          email: string;
          phone?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          office_id?: string | null;
          full_name?: string;
          email?: string;
          phone?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "employees_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employees_office_id_fkey";
            columns: ["office_id"];
            isOneToOne: false;
            referencedRelation: "offices";
            referencedColumns: ["id"];
          },
        ];
      };
      bulk_purchases: {
        Row: {
          id: string;
          organization_id: string;
          package_code: string;
          quantity: number;
          amount_usd_total: number;
          stripe_payment_intent_id: string | null;
          transaction_id: string | null;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          package_code: string;
          quantity: number;
          amount_usd_total: number;
          stripe_payment_intent_id?: string | null;
          transaction_id?: string | null;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          package_code?: string;
          quantity?: number;
          amount_usd_total?: number;
          stripe_payment_intent_id?: string | null;
          transaction_id?: string | null;
          status?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bulk_purchases_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bulk_purchases_package_code_fkey";
            columns: ["package_code"];
            isOneToOne: false;
            referencedRelation: "packages";
            referencedColumns: ["code"];
          },
        ];
      };
      esim_seats: {
        Row: {
          id: string;
          bulk_purchase_id: string;
          organization_id: string;
          order_id: string | null;
          assigned_employee_id: string | null;
          assigned_email: string | null;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          bulk_purchase_id: string;
          organization_id: string;
          order_id?: string | null;
          assigned_employee_id?: string | null;
          assigned_email?: string | null;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          bulk_purchase_id?: string;
          organization_id?: string;
          order_id?: string | null;
          assigned_employee_id?: string | null;
          assigned_email?: string | null;
          status?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "esim_seats_bulk_purchase_id_fkey";
            columns: ["bulk_purchase_id"];
            isOneToOne: false;
            referencedRelation: "bulk_purchases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "esim_seats_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "esim_seats_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "esim_seats_assigned_employee_id_fkey";
            columns: ["assigned_employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      packages: {
        Row: {
          code: string;
          created_at: string;
          data_mb: number;
          flag_emoji: string;
          id: string;
          is_active: boolean;
          is_popular: boolean;
          local_currency: string | null;
          local_price: number | null;
          location_code: string;
          location_name: string;
          name: string;
          networks: string[];
          region_type: string;
          retail_price_usd: number;
          validity_days: number;
        };
        Insert: {
          code: string;
          created_at?: string;
          data_mb: number;
          flag_emoji?: string;
          id?: string;
          is_active?: boolean;
          is_popular?: boolean;
          local_currency?: string | null;
          local_price?: number | null;
          location_code: string;
          location_name: string;
          name: string;
          networks?: string[];
          region_type?: string;
          retail_price_usd: number;
          validity_days: number;
        };
        Update: {
          code?: string;
          created_at?: string;
          data_mb?: number;
          flag_emoji?: string;
          id?: string;
          is_active?: boolean;
          is_popular?: boolean;
          local_currency?: string | null;
          local_price?: number | null;
          location_code?: string;
          location_name?: string;
          name?: string;
          networks?: string[];
          region_type?: string;
          retail_price_usd?: number;
          validity_days?: number;
        };
        Relationships: [];
      };
      system_settings: {
        Row: {
          key: string;
          value: Json;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: Json;
          updated_at?: string;
        };
        Update: {
          key?: string;
          value?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      webhook_logs: {
        Row: {
          id: string;
          event_type: string;
          order_no: string;
          signature: string;
          payload: Json;
          processed_at: string;
        };
        Insert: {
          id?: string;
          event_type: string;
          order_no: string;
          signature: string;
          payload: Json;
          processed_at?: string;
        };
        Update: {
          id?: string;
          event_type?: string;
          order_no?: string;
          signature?: string;
          payload?: Json;
          processed_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
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
  public: {
    Enums: {},
  },
} as const;
