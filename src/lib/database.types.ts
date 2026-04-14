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
      crew_members: {
        Row: {
          created_at: string
          crew_id: string
          id: string
          invited_by: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          crew_id: string
          id?: string
          invited_by: string
          status: string
          user_id: string
        }
        Update: {
          created_at?: string
          crew_id?: string
          id?: string
          invited_by?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_members_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crews: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "crews_created_by_fkey"
            columns: ["created_by"]
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
      profiles: {
        Row: {
          active_gym_id: string | null
          allow_crew_invites: boolean
          avatar_url: string
          created_at: string
          id: string
          invites_sent_date: string | null
          invites_sent_today: number
          name: string
          onboarded: boolean
          theme: string
          updated_at: string
          username: string
        }
        Insert: {
          active_gym_id?: string | null
          allow_crew_invites?: boolean
          avatar_url?: string
          created_at?: string
          id: string
          invites_sent_date?: string | null
          invites_sent_today?: number
          name?: string
          onboarded?: boolean
          theme?: string
          updated_at?: string
          username: string
        }
        Update: {
          active_gym_id?: string | null
          allow_crew_invites?: boolean
          avatar_url?: string
          created_at?: string
          id?: string
          invites_sent_date?: string | null
          invites_sent_today?: number
          name?: string
          onboarded?: boolean
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
          gym_id: string
          id: string
          route_id: string
          updated_at: string
          user_id: string
          zone: boolean
        }
        Insert: {
          attempts?: number
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          grade_vote?: number | null
          gym_id: string
          id?: string
          route_id: string
          updated_at?: string
          user_id: string
          zone?: boolean
        }
        Update: {
          attempts?: number
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          grade_vote?: number | null
          gym_id?: string
          id?: string
          route_id?: string
          updated_at?: string
          user_id?: string
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
            foreignKeyName: "route_logs_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
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
          community_grade: number | null
          created_at: string
          grade_vote_count: number
          has_zone: boolean
          id: string
          number: number
          set_id: string
          setter_name: string | null
          updated_at: string
        }
        Insert: {
          community_grade?: number | null
          created_at?: string
          grade_vote_count?: number
          has_zone?: boolean
          id?: string
          number: number
          set_id: string
          setter_name?: string | null
          updated_at?: string
        }
        Update: {
          community_grade?: number | null
          created_at?: string
          grade_vote_count?: number
          has_zone?: boolean
          id?: string
          number?: number
          set_id?: string
          setter_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "routes_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "sets"
            referencedColumns: ["id"]
          },
        ]
      }
      sets: {
        Row: {
          active: boolean
          closing_event: boolean
          competition_id: string | null
          created_at: string
          ends_at: string
          grading_scale: string
          gym_id: string
          id: string
          max_grade: number
          name: string | null
          starts_at: string
          status: string
          updated_at: string
          venue_gym_id: string | null
        }
        Insert: {
          active?: boolean
          closing_event?: boolean
          competition_id?: string | null
          created_at?: string
          ends_at: string
          grading_scale?: string
          gym_id: string
          id?: string
          max_grade?: number
          name?: string | null
          starts_at: string
          status?: string
          updated_at?: string
          venue_gym_id?: string | null
        }
        Update: {
          active?: boolean
          closing_event?: boolean
          competition_id?: string | null
          created_at?: string
          ends_at?: string
          grading_scale?: string
          gym_id?: string
          id?: string
          max_grade?: number
          name?: string | null
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
      user_set_stats: {
        Row: {
          flashes: number
          gym_id: string
          points: number
          sends: number
          set_id: string
          updated_at: string
          user_id: string
          zones: number
        }
        Insert: {
          flashes?: number
          gym_id: string
          points?: number
          sends?: number
          set_id: string
          updated_at?: string
          user_id: string
          zones?: number
        }
        Update: {
          flashes?: number
          gym_id?: string
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
      auto_publish_due_sets: { Args: never; Returns: number }
      bump_invite_rate_limit: { Args: never; Returns: boolean }
      crew_member_status: { Args: { p_crew_id: string }; Returns: string }
      get_active_climber_count: { Args: { p_set_id: string }; Returns: number }
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
      get_crew_activity_feed:
        | {
            Args: { p_before?: string; p_crew_id: string; p_limit?: number }
            Returns: {
              avatar_url: string
              gym_id: string
              gym_name: string
              happened_at: string
              is_flash: boolean
              is_zone: boolean
              route_id: string
              route_log_id: string
              route_number: number
              set_ends_at: string
              set_id: string
              set_name: string
              set_starts_at: string
              user_id: string
              username: string
            }[]
          }
        | {
            Args: { p_before?: string; p_limit?: number }
            Returns: {
              avatar_url: string
              gym_id: string
              gym_name: string
              happened_at: string
              is_flash: boolean
              is_zone: boolean
              route_id: string
              route_log_id: string
              route_number: number
              set_ends_at: string
              set_id: string
              set_name: string
              set_starts_at: string
              user_id: string
              username: string
            }[]
          }
      get_crew_leaderboard: {
        Args: {
          p_crew_id: string
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
      get_gym_active_climber_count: {
        Args: { p_gym_id: string }
        Returns: number
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
      get_leaderboard_neighbourhood: {
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
      increment_comment_likes: {
        Args: { p_comment_id: string; p_delta: number }
        Returns: number
      }
      is_active_crew_member: { Args: { p_crew_id: string }; Returns: boolean }
      is_admin_of_route: { Args: { p_route_id: string }; Returns: boolean }
      is_blocking: {
        Args: { p_blocked: string; p_blocker: string }
        Returns: boolean
      }
      is_competition_organiser: {
        Args: { p_competition_id: string }
        Returns: boolean
      }
      is_gym_admin: { Args: { p_gym_id: string }; Returns: boolean }
      is_gym_member: { Args: { p_gym_id: string }; Returns: boolean }
      is_gym_owner: { Args: { p_gym_id: string }; Returns: boolean }
      recompute_route_grade: {
        Args: { p_route_id: string }
        Returns: undefined
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
