export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_events: {
        Row: {
          created_at: string
          gym_id: string | null
          id: string
          route_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          gym_id?: string | null
          id?: string
          route_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          gym_id?: string | null
          id?: string
          route_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          gym_id: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          gym_id: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          gym_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_likes_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string
          created_at: string
          gym_id: string
          id: string
          likes: number
          parent_id: string | null
          route_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          gym_id: string
          id?: string
          likes?: number
          parent_id?: string | null
          route_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          gym_id?: string
          id?: string
          likes?: number
          parent_id?: string | null
          route_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_categories: {
        Row: {
          competition_id: string
          created_at: string
          display_order: number
          id: string
          name: string
        }
        Insert: {
          competition_id: string
          created_at?: string
          display_order?: number
          id?: string
          name: string
        }
        Update: {
          competition_id?: string
          created_at?: string
          display_order?: number
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "competition_categories_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_gyms: {
        Row: {
          added_at: string
          competition_id: string
          gym_id: string
        }
        Insert: {
          added_at?: string
          competition_id: string
          gym_id: string
        }
        Update: {
          added_at?: string
          competition_id?: string
          gym_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competition_gyms_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_gyms_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_participants: {
        Row: {
          category_id: string | null
          competition_id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          category_id?: string | null
          competition_id: string
          joined_at?: string
          user_id: string
        }
        Update: {
          category_id?: string | null
          competition_id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competition_participants_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "competition_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_participants_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      competitions: {
        Row: {
          created_at: string
          description: string | null
          ends_at: string | null
          id: string
          name: string
          organiser_id: string | null
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          name: string
          organiser_id?: string | null
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          name?: string
          organiser_id?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitions_organiser_id_fkey"
            columns: ["organiser_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friends: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "mates_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mates_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_admins: {
        Row: {
          created_at: string
          gym_id: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          gym_id: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          gym_id?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_admins_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_invites: {
        Row: {
          accepted_at: string | null
          email: string
          expires_at: string
          gym_id: string
          id: string
          invited_at: string
          invited_by: string
          role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          email: string
          expires_at?: string
          gym_id: string
          id?: string
          invited_at?: string
          invited_by: string
          role?: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          email?: string
          expires_at?: string
          gym_id?: string
          id?: string
          invited_at?: string
          invited_by?: string
          role?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_invites_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_memberships: {
        Row: {
          created_at: string
          gym_id: string
          id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          gym_id: string
          id?: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          gym_id?: string
          id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_memberships_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gyms: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          id: string
          is_listed: boolean
          logo_url: string | null
          name: string
          plan_tier: string
          slug: string
          updated_at: string
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_listed?: boolean
          logo_url?: string | null
          name: string
          plan_tier?: string
          slug: string
          updated_at?: string
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_listed?: boolean
          logo_url?: string | null
          name?: string
          plan_tier?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          kind: string
          payload: Json
          read_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          read_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_gym_id: string | null
          allow_friend_requests: boolean
          avatar_url: string
          created_at: string
          id: string
          name: string
          onboarded: boolean
          push_invite_accepted: boolean
          push_invite_received: boolean
          push_ownership_changed: boolean
          theme: string
          updated_at: string
          username: string
        }
        Insert: {
          active_gym_id?: string | null
          allow_friend_requests?: boolean
          avatar_url?: string
          created_at?: string
          id: string
          name?: string
          onboarded?: boolean
          push_invite_accepted?: boolean
          push_invite_received?: boolean
          push_ownership_changed?: boolean
          theme?: string
          updated_at?: string
          username: string
        }
        Update: {
          active_gym_id?: string | null
          allow_friend_requests?: boolean
          avatar_url?: string
          created_at?: string
          id?: string
          name?: string
          onboarded?: boolean
          push_invite_accepted?: boolean
          push_invite_received?: boolean
          push_ownership_changed?: boolean
          theme?: string
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_gym_id_fkey"
            columns: ["active_gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      route_logs: {
        Row: {
          attempts: number
          completed: boolean
          completed_at: string | null
          created_at: string
          grade_vote: number | null
          gym_id: string | null
          id: string
          player_id: string | null
          route_id: string
          set_id: string
          updated_at: string
          user_id: string | null
          zone: boolean
        }
        Insert: {
          attempts?: number
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          grade_vote?: number | null
          gym_id?: string | null
          id?: string
          player_id?: string | null
          route_id: string
          set_id: string
          updated_at?: string
          user_id?: string | null
          zone?: boolean
        }
        Update: {
          attempts?: number
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          grade_vote?: number | null
          gym_id?: string | null
          id?: string
          player_id?: string | null
          route_id?: string
          set_id?: string
          updated_at?: string
          user_id?: string | null
          zone?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "route_logs_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_logs_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "set_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_logs_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_logs_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      route_tags: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      route_tags_map: {
        Row: {
          route_id: string
          tag_id: string
        }
        Insert: {
          route_id: string
          tag_id: string
        }
        Update: {
          route_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_tags_map_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_tags_map_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "route_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          added_by: string | null
          added_by_player: string | null
          community_grade: number | null
          created_at: string
          declared_grade: number | null
          description: string | null
          discipline: string | null
          grade_vote_count: number
          has_zone: boolean
          id: string
          number: number
          set_id: string
          setter_name: string | null
          updated_at: string
          withdrawn_at: string | null
        }
        Insert: {
          added_by?: string | null
          added_by_player?: string | null
          community_grade?: number | null
          created_at?: string
          declared_grade?: number | null
          description?: string | null
          discipline?: string | null
          grade_vote_count?: number
          has_zone?: boolean
          id?: string
          number: number
          set_id: string
          setter_name?: string | null
          updated_at?: string
          withdrawn_at?: string | null
        }
        Update: {
          added_by?: string | null
          added_by_player?: string | null
          community_grade?: number | null
          created_at?: string
          declared_grade?: number | null
          description?: string | null
          discipline?: string | null
          grade_vote_count?: number
          has_zone?: boolean
          id?: string
          number?: number
          set_id?: string
          setter_name?: string | null
          updated_at?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routes_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_added_by_player_fkey"
            columns: ["added_by_player"]
            isOneToOne: false
            referencedRelation: "set_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "sets"
            referencedColumns: ["id"]
          },
        ]
      }
      set_grades: {
        Row: {
          label: string
          ordinal: number
          set_id: string
        }
        Insert: {
          label: string
          ordinal: number
          set_id: string
        }
        Update: {
          label?: string
          ordinal?: number
          set_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "set_grades_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "sets"
            referencedColumns: ["id"]
          },
        ]
      }
      set_players: {
        Row: {
          ceiling: number | null
          display_name: string | null
          id: string
          is_host: boolean
          joined_at: string
          left_at: string | null
          set_id: string
          user_id: string | null
        }
        Insert: {
          ceiling?: number | null
          display_name?: string | null
          id?: string
          is_host?: boolean
          joined_at?: string
          left_at?: string | null
          set_id: string
          user_id?: string | null
        }
        Update: {
          ceiling?: number | null
          display_name?: string | null
          id?: string
          is_host?: boolean
          joined_at?: string
          left_at?: string | null
          set_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "set_players_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "set_players_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sets: {
        Row: {
          active: boolean
          alt_grading_scale: string | null
          alt_max_grade: number | null
          alt_min_grade: number | null
          closing_event: boolean
          code: string | null
          competition_id: string | null
          created_at: string
          discipline: string
          ends_at: string | null
          game_mode: string
          grading_scale: string
          gym_id: string | null
          handicap: boolean
          host_id: string | null
          id: string
          last_activity_at: string | null
          location: string | null
          max_grade: number | null
          min_grade: number | null
          name: string | null
          owner_kind: string
          share_token: string | null
          starts_at: string
          status: string
          updated_at: string
          venue_gym_id: string | null
        }
        Insert: {
          active?: boolean
          alt_grading_scale?: string | null
          alt_max_grade?: number | null
          alt_min_grade?: number | null
          closing_event?: boolean
          code?: string | null
          competition_id?: string | null
          created_at?: string
          discipline?: string
          ends_at?: string | null
          game_mode?: string
          grading_scale?: string
          gym_id?: string | null
          handicap?: boolean
          host_id?: string | null
          id?: string
          last_activity_at?: string | null
          location?: string | null
          max_grade?: number | null
          min_grade?: number | null
          name?: string | null
          owner_kind?: string
          share_token?: string | null
          starts_at: string
          status?: string
          updated_at?: string
          venue_gym_id?: string | null
        }
        Update: {
          active?: boolean
          alt_grading_scale?: string | null
          alt_max_grade?: number | null
          alt_min_grade?: number | null
          closing_event?: boolean
          code?: string | null
          competition_id?: string | null
          created_at?: string
          discipline?: string
          ends_at?: string | null
          game_mode?: string
          grading_scale?: string
          gym_id?: string | null
          handicap?: boolean
          host_id?: string | null
          id?: string
          last_activity_at?: string | null
          location?: string | null
          max_grade?: number | null
          min_grade?: number | null
          name?: string | null
          owner_kind?: string
          share_token?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
          venue_gym_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sets_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sets_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sets_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sets_venue_gym_id_fkey"
            columns: ["venue_gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      user_achievements: {
        Row: {
          badge_id: string
          created_at: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          badge_id: string
          created_at?: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          badge_id?: string
          created_at?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_custom_scale_grades: {
        Row: {
          label: string
          ordinal: number
          scale_id: string
        }
        Insert: {
          label: string
          ordinal: number
          scale_id: string
        }
        Update: {
          label?: string
          ordinal?: number
          scale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_custom_scale_grades_scale_id_fkey"
            columns: ["scale_id"]
            isOneToOne: false
            referencedRelation: "user_custom_scales"
            referencedColumns: ["id"]
          },
        ]
      }
      user_custom_scales: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_custom_scales_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_set_stats: {
        Row: {
          flashes: number
          gym_id: string | null
          points: number
          sends: number
          set_id: string
          updated_at: string
          user_id: string
          zones: number
        }
        Insert: {
          flashes?: number
          gym_id?: string | null
          points?: number
          sends?: number
          set_id: string
          updated_at?: string
          user_id: string
          zones?: number
        }
        Update: {
          flashes?: number
          gym_id?: string | null
          points?: number
          sends?: number
          set_id?: string
          updated_at?: string
          user_id?: string
          zones?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_set_stats_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_set_stats_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_set_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_match_route: {
        Args: {
          p_description?: string
          p_discipline?: string
          p_grade?: number
          p_has_zone?: boolean
          p_player_id?: string
          p_set_id: string
        }
        Returns: {
          added_by: string | null
          added_by_player: string | null
          community_grade: number | null
          created_at: string
          declared_grade: number | null
          description: string | null
          discipline: string | null
          grade_vote_count: number
          has_zone: boolean
          id: string
          number: number
          set_id: string
          setter_name: string | null
          updated_at: string
          withdrawn_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "routes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      auto_archive_ended_sets: { Args: never; Returns: number }
      auto_publish_due_sets: { Args: never; Returns: number }
      bump_invite_rate_limit: { Args: never; Returns: boolean }
      can_read_set: { Args: { p_set_id: string }; Returns: boolean }
      chork_allowance: {
        Args: {
          p_ceiling: number
          p_challenge_grade: number
          p_setter_attempts: number
        }
        Returns: number
      }
      chork_concede: {
        Args: { p_player_id?: string; p_route_id: string; p_set_id: string }
        Returns: {
          attempts: number
          completed: boolean
          completed_at: string | null
          created_at: string
          grade_vote: number | null
          gym_id: string | null
          id: string
          player_id: string | null
          route_id: string
          set_id: string
          updated_at: string
          user_id: string | null
          zone: boolean
        }
        SetofOptions: {
          from: "*"
          to: "route_logs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      chork_is_letter: {
        Args: { p_allowance: number; p_attempts: number; p_completed: boolean }
        Returns: boolean
      }
      chork_round_allowance: {
        Args: { p_player_id?: string; p_route_id: string; p_set_id: string }
        Returns: number
      }
      chork_standings: {
        Args: { p_set_id: string }
        Returns: {
          avatar_url: string
          display_name: string
          has_left: boolean
          has_pen: boolean
          is_guest: boolean
          is_out: boolean
          letters: number
          player_id: string
          user_id: string
          username: string
        }[]
      }
      chork_withdraw_route: {
        Args: { p_player_id?: string; p_route_id: string }
        Returns: {
          added_by: string | null
          added_by_player: string | null
          community_grade: number | null
          created_at: string
          declared_grade: number | null
          description: string | null
          discipline: string | null
          grade_vote_count: number
          has_zone: boolean
          id: string
          number: number
          set_id: string
          setter_name: string | null
          updated_at: string
          withdrawn_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "routes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      compute_points: {
        Args: { p_attempts: number; p_completed: boolean; p_zone: boolean }
        Returns: number
      }
      create_gym_with_owner_tx: {
        Args: {
          p_city?: string
          p_country?: string
          p_name: string
          p_plan_tier: string
          p_slug: string
        }
        Returns: string
      }
      create_match: {
        Args: {
          p_alt_grading_scale?: string
          p_alt_max_grade?: number
          p_alt_min_grade?: number
          p_custom_grades?: string[]
          p_discipline?: string
          p_grading_scale?: string
          p_handicap?: boolean
          p_location?: string
          p_max_grade?: number
          p_min_grade?: number
          p_name?: string
          p_save_scale_name?: string
        }
        Returns: {
          code: string
          id: string
        }[]
      }
      discipline_family: { Args: { p_discipline: string }; Returns: string }
      end_match: {
        Args: { p_set_id: string }
        Returns: {
          active: boolean
          alt_grading_scale: string | null
          alt_max_grade: number | null
          alt_min_grade: number | null
          closing_event: boolean
          code: string | null
          competition_id: string | null
          created_at: string
          discipline: string
          ends_at: string | null
          game_mode: string
          grading_scale: string
          gym_id: string | null
          handicap: boolean
          host_id: string | null
          id: string
          last_activity_at: string | null
          location: string | null
          max_grade: number | null
          min_grade: number | null
          name: string | null
          owner_kind: string
          share_token: string | null
          starts_at: string
          status: string
          updated_at: string
          venue_gym_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      end_stale_matches: { Args: never; Returns: number }
      generate_set_code: { Args: never; Returns: string }
      get_active_climber_count: { Args: { p_set_id: string }; Returns: number }
      get_active_match_for_user: {
        Args: { p_user_id: string }
        Returns: {
          code: string
          joined_at: string
          location: string
          name: string
          player_count: number
          set_id: string
        }[]
      }
      get_all_time_overview: {
        Args: { p_gym_id: string }
        Returns: {
          set_count: number
          top_route_id: string
          top_route_number: number
          top_route_send_count: number
          top_route_set_id: string
          total_sends: number
          unique_climbers: number
        }[]
      }
      get_community_grade_distribution: {
        Args: { p_set_id: string }
        Returns: {
          grade: number
          number: number
          route_id: string
          vote_count: number
        }[]
      }
      get_competition_leaderboard: {
        Args: {
          p_category_id?: string
          p_competition_id: string
          p_limit?: number
          p_offset?: number
        }
        Returns: {
          avatar_url: string
          category_id: string
          flashes: number
          name: string
          points: number
          rank: number
          sends: number
          user_id: string
          username: string
          zones: number
        }[]
      }
      get_competition_venue_stats: {
        Args: { p_competition_id: string }
        Returns: {
          active_climber_count: number
          gym_id: string
          gym_name: string
          gym_slug: string
          set_count: number
          total_flashes: number
          total_sends: number
        }[]
      }
      get_engagement_trend: {
        Args: { p_gym_id: string; p_limit?: number }
        Returns: {
          active_climber_count: number
          ends_at: string
          name: string
          set_id: string
          starts_at: string
          status: string
        }[]
      }
      get_flash_leaderboard_set: {
        Args: { p_limit?: number; p_set_id: string }
        Returns: {
          avatar_url: string
          flash_count: number
          user_id: string
          username: string
        }[]
      }
      get_friend_moments: {
        Args: { p_days?: number; p_limit?: number }
        Returns: {
          avatar_url: string
          detail: Json
          kind: string
          name: string
          occurred_on: string
          user_id: string
          username: string
        }[]
      }
      get_friend_suggestions: {
        Args: { p_limit?: number }
        Returns: {
          avatar_url: string
          last_climbed_at: string
          name: string
          shared_matches: number
          user_id: string
          username: string
        }[]
      }
      get_friends: {
        Args: never
        Returns: {
          avatar_url: string
          created_at: string
          direction: string
          friend_id: string
          name: string
          status: string
          user_id: string
          username: string
        }[]
      }
      get_friends_leaderboard: {
        Args: { p_limit?: number; p_offset?: number; p_set_id: string }
        Returns: {
          avatar_url: string
          flashes: number
          is_self: boolean
          name: string
          points: number
          rank: number
          sends: number
          user_id: string
          username: string
          zones: number
        }[]
      }
      get_grade_distribution: {
        Args: { p_user_id: string }
        Returns: {
          discipline: string
          flashes: number
          grade: number
          grading_scale: string
          sends: number
        }[]
      }
      get_gym_active_climber_count: {
        Args: { p_gym_id: string }
        Returns: number
      }
      get_gym_stats_v2: {
        Args: { p_gym_id: string; p_set_id?: string }
        Returns: Json
      }
      get_gym_stats_v2_cached: {
        Args: { p_gym_id: string; p_set_id?: string }
        Returns: Json
      }
      get_leaderboard_all_time: {
        Args: { p_gym_id: string; p_limit?: number; p_offset?: number }
        Returns: {
          avatar_url: string
          flashes: number
          name: string
          points: number
          rank: number
          sends: number
          user_id: string
          username: string
          zones: number
        }[]
      }
      get_leaderboard_all_time_cached: {
        Args: { p_gym_id: string; p_limit?: number; p_offset?: number }
        Returns: {
          avatar_url: string
          flashes: number
          name: string
          points: number
          rank: number
          sends: number
          user_id: string
          username: string
          zones: number
        }[]
      }
      get_leaderboard_neighbourhood: {
        Args: { p_gym_id: string; p_set_id?: string; p_user_id: string }
        Returns: {
          avatar_url: string
          board_position: number
          flashes: number
          name: string
          points: number
          rank: number
          sends: number
          user_id: string
          username: string
          zones: number
        }[]
      }
      get_leaderboard_set: {
        Args: {
          p_gym_id: string
          p_limit?: number
          p_offset?: number
          p_set_id: string
        }
        Returns: {
          avatar_url: string
          flashes: number
          name: string
          points: number
          rank: number
          sends: number
          user_id: string
          username: string
          zones: number
        }[]
      }
      get_leaderboard_set_cached: {
        Args: {
          p_gym_id: string
          p_limit?: number
          p_offset?: number
          p_set_id: string
        }
        Returns: {
          avatar_url: string
          flashes: number
          name: string
          points: number
          rank: number
          sends: number
          user_id: string
          username: string
          zones: number
        }[]
      }
      get_leaderboard_user_row: {
        Args: { p_gym_id: string; p_set_id?: string; p_user_id: string }
        Returns: {
          avatar_url: string
          flashes: number
          name: string
          points: number
          rank: number
          sends: number
          user_id: string
          username: string
          zones: number
        }[]
      }
      get_match_achievement_context: {
        Args: { p_user_id: string }
        Returns: {
          match_total_flashes: number
          match_total_points: number
          match_total_sends: number
          matches_hosted: number
          matches_played: number
          matches_won: number
          max_iron_crew_pair_count: number
          max_players_in_won_match: number
          unique_coplayers: number
        }[]
      }
      get_match_history: {
        Args: { p_before?: string; p_limit?: number; p_user_id: string }
        Returns: {
          duration_seconds: number
          ended_at: string
          handicap: boolean
          location: string
          name: string
          player_count: number
          set_id: string
          started_at: string
          user_flashes: number
          user_is_winner: boolean
          user_points: number
          user_points_tenths: number
          user_rank: number
          user_sends: number
          winner_display_name: string
          winner_user_id: string
          winner_username: string
        }[]
      }
      get_match_leaderboard: {
        Args: { p_set_id: string; p_viewer_id?: string }
        Returns: {
          attempts: number
          avatar_url: string
          display_name: string
          flashes: number
          has_left: boolean
          is_guest: boolean
          last_send_at: string
          player_id: string
          points: number
          points_tenths: number
          rank: number
          sends: number
          user_id: string
          username: string
          zones: number
        }[]
      }
      get_match_state_for_user: {
        Args: { p_set_id: string; p_user_id: string }
        Returns: Json
      }
      get_profile_summary: {
        Args: { p_gym_id: string; p_user_id: string }
        Returns: Json
      }
      get_public_match_result: { Args: { p_token: string }; Returns: Json }
      get_route_grade: {
        Args: { p_route_id: string }
        Returns: {
          community_grade: number
          route_id: string
          vote_count: number
        }[]
      }
      get_set_overview: {
        Args: { p_set_id: string }
        Returns: {
          active_climber_count: number
          days_remaining: number
          max_possible_sends: number
          send_completion_pct: number
          time_elapsed_pct: number
          total_routes: number
          total_sends: number
        }[]
      }
      get_setter_breakdown: {
        Args: { p_set_id: string }
        Returns: {
          flash_rate: number
          route_count: number
          setter_name: string
          total_attempts: number
          total_sends: number
        }[]
      }
      get_top_routes: {
        Args: { p_limit?: number; p_set_id: string }
        Returns: {
          attempt_count: number
          flash_count: number
          flash_rate: number
          has_zone: boolean
          number: number
          route_id: string
          send_count: number
        }[]
      }
      get_user_saved_scales: {
        Args: never
        Returns: {
          created_at: string
          grades: Json
          id: string
          name: string
        }[]
      }
      get_user_set_stats: {
        Args: { p_gym_id: string; p_user_id: string }
        Returns: {
          completions: number
          flashes: number
          points: number
          set_id: string
        }[]
      }
      get_zone_send_ratio: {
        Args: { p_set_id: string }
        Returns: {
          has_zone: boolean
          number: number
          route_id: string
          send_count: number
          zone_only: number
        }[]
      }
      handicap_multiplier: {
        Args: { p_ceiling: number; p_route_grade: number }
        Returns: number
      }
      handicap_points_tenths: {
        Args: {
          p_attempts: number
          p_ceiling: number
          p_completed: boolean
          p_route_grade: number
          p_zone: boolean
        }
        Returns: number
      }
      is_active_set_player: { Args: { p_set_id: string }; Returns: boolean }
      is_admin_of_route: { Args: { p_route_id: string }; Returns: boolean }
      is_competition_organiser: {
        Args: { p_competition_id: string }
        Returns: boolean
      }
      is_friend: { Args: { p_user_id: string }; Returns: boolean }
      is_gym_admin: { Args: { p_gym_id: string }; Returns: boolean }
      is_gym_member: { Args: { p_gym_id: string }; Returns: boolean }
      is_gym_owner: { Args: { p_gym_id: string }; Returns: boolean }
      is_set_player: { Args: { p_set_id: string }; Returns: boolean }
      join_match: {
        Args: { p_set_id: string }
        Returns: {
          ceiling: number | null
          display_name: string | null
          id: string
          is_host: boolean
          joined_at: string
          left_at: string | null
          set_id: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "set_players"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      lookup_match_by_code: {
        Args: { p_code: string }
        Returns: {
          at_cap: boolean
          grading_scale: string
          host_display_name: string
          host_username: string
          location: string
          name: string
          player_count: number
          set_id: string
          status: string
        }[]
      }
      mark_all_notifications_read: {
        Args: { p_user_id: string }
        Returns: number
      }
      match_standings: {
        Args: { p_set_id: string }
        Returns: {
          attempts: number
          flashes: number
          has_left: boolean
          last_send_at: string
          player_id: string
          points: number
          points_tenths: number
          rank: number
          sends: number
          user_id: string
          zones: number
        }[]
      }
      notify_user: {
        Args: { p_kind: string; p_payload?: Json; p_user_id: string }
        Returns: string
      }
      prune_old_activity_events: { Args: never; Returns: number }
      prune_old_notifications: { Args: never; Returns: number }
      recompute_route_grade: {
        Args: { p_route_id: string }
        Returns: undefined
      }
      remove_friend: { Args: { p_user_id: string }; Returns: undefined }
      request_friend: {
        Args: { p_user_id: string }
        Returns: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          responded_at: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "friends"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_admin_invite: {
        Args: { p_token: string }
        Returns: {
          accepted: boolean
          email: string
          expired: boolean
          expires_at: string
          gym_id: string
          id: string
          role: string
        }[]
      }
      respond_to_friend: {
        Args: { p_accept: boolean; p_friend_id: string }
        Returns: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          responded_at: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "friends"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_climbers_fuzzy: {
        Args: { p_caller_id: string; p_limit?: number; p_query: string }
        Returns: {
          active_gym_id: string
          allow_crew_invites: boolean
          avatar_url: string
          id: string
          name: string
          score: number
          username: string
        }[]
      }
      set_match_ceiling: {
        Args: { p_ceiling?: number; p_player_id: string; p_set_id: string }
        Returns: {
          ceiling: number | null
          display_name: string | null
          id: string
          is_host: boolean
          joined_at: string
          left_at: string | null
          set_id: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "set_players"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_match_game_mode: {
        Args: { p_mode: string; p_set_id: string }
        Returns: {
          active: boolean
          alt_grading_scale: string | null
          alt_max_grade: number | null
          alt_min_grade: number | null
          closing_event: boolean
          code: string | null
          competition_id: string | null
          created_at: string
          discipline: string
          ends_at: string | null
          game_mode: string
          grading_scale: string
          gym_id: string | null
          handicap: boolean
          host_id: string | null
          id: string
          last_activity_at: string | null
          location: string | null
          max_grade: number | null
          min_grade: number | null
          name: string | null
          owner_kind: string
          share_token: string | null
          starts_at: string
          status: string
          updated_at: string
          venue_gym_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_match_handicap: {
        Args: { p_enabled: boolean; p_set_id: string }
        Returns: {
          active: boolean
          alt_grading_scale: string | null
          alt_max_grade: number | null
          alt_min_grade: number | null
          closing_event: boolean
          code: string | null
          competition_id: string | null
          created_at: string
          discipline: string
          ends_at: string | null
          game_mode: string
          grading_scale: string
          gym_id: string | null
          handicap: boolean
          host_id: string | null
          id: string
          last_activity_at: string | null
          location: string | null
          max_grade: number | null
          min_grade: number | null
          name: string | null
          owner_kind: string
          share_token: string | null
          starts_at: string
          status: string
          updated_at: string
          venue_gym_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_route_tags_tx: {
        Args: { p_route_id: string; p_tag_ids: string[] }
        Returns: undefined
      }
      upsert_match_log: {
        Args: {
          p_attempts?: number
          p_completed?: boolean
          p_player_id?: string
          p_route_id: string
          p_zone?: boolean
        }
        Returns: {
          attempts: number
          completed: boolean
          completed_at: string | null
          created_at: string
          grade_vote: number | null
          gym_id: string | null
          id: string
          player_id: string | null
          route_id: string
          set_id: string
          updated_at: string
          user_id: string | null
          zone: boolean
        }
        SetofOptions: {
          from: "*"
          to: "route_logs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
