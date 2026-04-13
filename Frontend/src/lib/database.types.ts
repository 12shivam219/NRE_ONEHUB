export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'user' | 'marketing' | 'admin';
export type UserStatus = 'pending_verification' | 'pending_approval' | 'approved' | 'rejected';
export type ErrorStatus = 'new' | 'in_progress' | 'resolved' | 'closed';
export type DocumentSource = 'local' | 'google_drive';
export type RequirementStatus = 'NEW' | 'IN_PROGRESS' | 'SUBMITTED' | 'INTERVIEW' | 'OFFER' | 'REJECTED' | 'CLOSED';

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          role: UserRole;
          status: UserStatus;
          email_verified: boolean;
          origin_ip: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          full_name: string;
          role?: UserRole;
          status?: UserStatus;
          email_verified?: boolean;
          origin_ip?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          role?: UserRole;
          status?: UserStatus;
          email_verified?: boolean;
          origin_ip?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      login_history: {
        Row: {
          id: string;
          user_id: string | null;
          ip_address: string;
          user_agent: string;
          browser: string | null;
          os: string | null;
          device: string | null;
          location: string | null;
          country_code: string | null;
          success: boolean;
          failure_reason: string | null;
          suspicious: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          ip_address: string;
          user_agent: string;
          browser?: string | null;
          os?: string | null;
          device?: string | null;
          location?: string | null;
          country_code?: string | null;
          success: boolean;
          failure_reason?: string | null;
          suspicious?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          ip_address?: string;
          user_agent?: string;
          browser?: string | null;
          os?: string | null;
          device?: string | null;
          location?: string | null;
          country_code?: string | null;
          success?: boolean;
          failure_reason?: string | null;
          suspicious?: boolean;
          created_at?: string;
        };
      };
      user_sessions: {
        Row: {
          id: string;
          user_id: string | null;
          revoked: boolean;
          last_activity: string;
          created_at: string;
          browser: string | null;
          os: string | null;
          device: string | null;
          ip_address: string | null;
          location: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          revoked?: boolean;
          last_activity?: string;
          created_at?: string;
          browser?: string | null;
          os?: string | null;
          device?: string | null;
          ip_address?: string | null;
          location?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          revoked?: boolean;
          last_activity?: string;
          created_at?: string;
          browser?: string | null;
          os?: string | null;
          device?: string | null;
          ip_address?: string | null;
          location?: string | null;
        };
      };
      activity_logs: {
        Row: {
          id: string;
          user_id: string | null;
          action: string;
          resource_type: string | null;
          resource_id: string | null;
          details: Json | null;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          action: string;
          resource_type?: string | null;
          resource_id?: string | null;
          details?: Json | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          action?: string;
          resource_type?: string | null;
          resource_id?: string | null;
          details?: Json | null;
          ip_address?: string | null;
          created_at?: string;
        };
      };
      documents: {
        Row: {
          id: string;
          user_id: string;
          filename: string;
          original_filename: string;
          file_size: number;
          mime_type: string;
          storage_path: string;
          version: number;
          parent_id: string | null;
          folder_id: string | null;
          source: DocumentSource;
          google_drive_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          filename: string;
          original_filename: string;
          file_size: number;
          mime_type: string;
          storage_path: string;
          version?: number;
          parent_id?: string | null;
          folder_id?: string | null;
          source?: DocumentSource;
          google_drive_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          filename?: string;
          original_filename?: string;
          file_size?: number;
          mime_type?: string;
          storage_path?: string;
          version?: number;
          parent_id?: string | null;
          folder_id?: string | null;
          source?: DocumentSource;
          google_drive_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      folders: {
        Row: {
          id: string;
          user_id: string;
          parent_folder_id: string | null;
          name: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          parent_folder_id?: string | null;
          name: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          parent_folder_id?: string | null;
          name?: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      folder_shares: {
        Row: {
          id: string;
          folder_id: string;
          shared_with_user_id: string;
          permission: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          folder_id: string;
          shared_with_user_id: string;
          permission?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          folder_id?: string;
          shared_with_user_id?: string;
          permission?: string;
          created_at?: string;
        };
      };
      document_versions: {
        Row: {
          id: string;
          document_id: string;
          version_number: number;
          storage_path: string;
          file_size: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          version_number: number;
          storage_path: string;
          file_size: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          document_id?: string;
          version_number?: number;
          storage_path?: string;
          file_size?: number;
          created_at?: string;
        };
      };
      requirements: {
        Row: {
          id: string;
          user_id: string;
          requirement_number: number;
          title: string;
          implementation_partner: string | null;
          client: string | null;
          description: string | null;
          status: RequirementStatus;
          consultant_id: string | null;
          rate: string | null;
          primary_tech_stack: string | null;
          vendor_company: string | null;
          vendor_website: string | null;
          vendor_person_name: string | null;
          vendor_phone: string | null;
          vendor_email: string | null;
          next_step: string | null;
          remote: string | null;
          duration: string | null;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          requirement_number?: number;
          title: string;
          implementation_partner?: string | null;
          client?: string | null;
          description?: string | null;
          status?: RequirementStatus;
          consultant_id?: string | null;
          rate?: string | null;
          primary_tech_stack?: string | null;
          vendor_company?: string | null;
          vendor_website?: string | null;
          vendor_person_name?: string | null;
          vendor_phone?: string | null;
          vendor_email?: string | null;
          next_step?: string | null;
          remote?: string | null;
          duration?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          requirement_number?: number;
          title?: string;
          implementation_partner?: string | null;
          client?: string | null;
          description?: string | null;
          status?: RequirementStatus;
          consultant_id?: string | null;
          rate?: string | null;
          primary_tech_stack?: string | null;
          vendor_company?: string | null;
          vendor_website?: string | null;
          vendor_person_name?: string | null;
          vendor_phone?: string | null;
          vendor_email?: string | null;
          next_step?: string | null;
          remote?: string | null;
          duration?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      interviews: {
        Row: {
          id: string;
          requirement_id: string;
          user_id: string;
          interview_number: number | null;
          scheduled_date: string;
          scheduled_time: string | null;
          timezone: string | null;
          duration_minutes: number;
          type: string | null;
          status: string;
          consultant_id: string | null;
          vendor_company: string | null;
          interview_with: string | null;
          result: string | null;
          round: string | null;
          mode: string | null;
          meeting_type: string | null;
          subject_line: string | null;
          interviewer: string | null;
          location: string | null;
          interview_focus: string | null;
          special_note: string | null;
          job_description_excerpt: string | null;
          feedback_notes: string | null;
          notes: string | null;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          requirement_id: string;
          user_id: string;
          interview_number?: number | null;
          scheduled_date: string;
          scheduled_time?: string | null;
          timezone?: string | null;
          duration_minutes?: number;
          type?: string | null;
          status?: string;
          consultant_id?: string | null;
          vendor_company?: string | null;
          interview_with?: string | null;
          result?: string | null;
          round?: string | null;
          mode?: string | null;
          meeting_type?: string | null;
          subject_line?: string | null;
          interviewer?: string | null;
          location?: string | null;
          interview_focus?: string | null;
          special_note?: string | null;
          job_description_excerpt?: string | null;
          feedback_notes?: string | null;
          notes?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          requirement_id?: string;
          user_id?: string;
          interview_number?: number | null;
          scheduled_date?: string;
          scheduled_time?: string | null;
          timezone?: string | null;
          duration_minutes?: number;
          type?: string | null;
          status?: string;
          consultant_id?: string | null;
          vendor_company?: string | null;
          interview_with?: string | null;
          result?: string | null;
          round?: string | null;
          mode?: string | null;
          meeting_type?: string | null;
          subject_line?: string | null;
          interviewer?: string | null;
          location?: string | null;
          interview_focus?: string | null;
          special_note?: string | null;
          job_description_excerpt?: string | null;
          feedback_notes?: string | null;
          notes?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      email_threads: {
        Row: {
          id: string;
          user_id: string;
          requirement_id: string | null;
          subject: string;
          from_email: string;
          to_email: string;
          body: string | null;
          thread_id: string | null;
          parent_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          requirement_id?: string | null;
          subject: string;
          from_email: string;
          to_email: string;
          body?: string | null;
          thread_id?: string | null;
          parent_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          requirement_id?: string | null;
          subject?: string;
          from_email?: string;
          to_email?: string;
          body?: string | null;
          thread_id?: string | null;
          parent_id?: string | null;
          created_at?: string;
        };
      };
      consultants: {
        Row: {
          id: string;
          user_id: string;
          status: string;
          name: string;
          email: string | null;
          phone: string | null;
          location: string | null;
          primary_skills: string | null;
          secondary_skills: string | null;
          total_experience: string | null;
          linkedin_profile: string | null;
          portfolio_link: string | null;
          availability: string | null;
          visa_status: string | null;
          date_of_birth: string | null;
          address: string | null;
          timezone: string | null;
          degree_name: string | null;
          university: string | null;
          year_of_passing: string | null;
          ssn: string | null;
          how_got_visa: string | null;
          year_came_to_us: string | null;
          country_of_origin: string | null;
          why_looking_for_job: string | null;
          preferred_work_location: string | null;
          preferred_work_type: string | null;
          expected_rate: string | null;
          payroll_company: string | null;
          payroll_contact_info: string | null;
          projects: Json | null;
          company: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          status?: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          location?: string | null;
          primary_skills?: string | null;
          secondary_skills?: string | null;
          total_experience?: string | null;
          linkedin_profile?: string | null;
          portfolio_link?: string | null;
          availability?: string | null;
          visa_status?: string | null;
          date_of_birth?: string | null;
          address?: string | null;
          timezone?: string | null;
          degree_name?: string | null;
          university?: string | null;
          year_of_passing?: string | null;
          ssn?: string | null;
          how_got_visa?: string | null;
          year_came_to_us?: string | null;
          country_of_origin?: string | null;
          why_looking_for_job?: string | null;
          preferred_work_location?: string | null;
          preferred_work_type?: string | null;
          expected_rate?: string | null;
          payroll_company?: string | null;
          payroll_contact_info?: string | null;
          projects?: Json | null;
          company?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          status?: string;
          name?: string;
          email?: string | null;
          phone?: string | null;
          location?: string | null;
          primary_skills?: string | null;
          secondary_skills?: string | null;
          total_experience?: string | null;
          linkedin_profile?: string | null;
          portfolio_link?: string | null;
          availability?: string | null;
          visa_status?: string | null;
          date_of_birth?: string | null;
          address?: string | null;
          timezone?: string | null;
          degree_name?: string | null;
          university?: string | null;
          year_of_passing?: string | null;
          ssn?: string | null;
          how_got_visa?: string | null;
          year_came_to_us?: string | null;
          country_of_origin?: string | null;
          why_looking_for_job?: string | null;
          preferred_work_location?: string | null;
          preferred_work_type?: string | null;
          expected_rate?: string | null;
          payroll_company?: string | null;
          payroll_contact_info?: string | null;
          projects?: Json | null;
          company?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      attachments: {
        Row: {
          id: string;
          user_id: string;
          resource_type: string;
          resource_id: string;
          filename: string;
          file_size: number;
          mime_type: string;
          storage_path: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          resource_type: string;
          resource_id: string;
          filename: string;
          file_size: number;
          mime_type: string;
          storage_path: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          resource_type?: string;
          resource_id?: string;
          filename?: string;
          file_size?: number;
          mime_type?: string;
          storage_path?: string;
          created_at?: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          message: string;
          type: string;
          read: boolean;
          link: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          message: string;
          type?: string;
          read?: boolean;
          link?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          message?: string;
          type?: string;
          read?: boolean;
          link?: string | null;
          created_at?: string;
        };
      };
      google_drive_tokens: {
        Row: {
          id: string;
          user_id: string;
          access_token: string;
          refresh_token: string;
          token_type: string;
          expires_at: string;
          scope: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          access_token: string;
          refresh_token: string;
          token_type?: string;
          expires_at: string;
          scope: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          access_token?: string;
          refresh_token?: string;
          token_type?: string;
          expires_at?: string;
          scope?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      error_reports: {
        Row: {
          id: string;
          user_id: string | null;
          error_message: string;
          error_stack: string | null;
          error_type: string | null;
          url: string | null;
          user_agent: string | null;
          status: ErrorStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          error_message: string;
          error_stack?: string | null;
          error_type?: string | null;
          url?: string | null;
          user_agent?: string | null;
          status?: ErrorStatus;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          error_message?: string;
          error_stack?: string | null;
          error_type?: string | null;
          url?: string | null;
          user_agent?: string | null;
          status?: ErrorStatus;
          created_at?: string;
        };
      };
      rate_limits: {
        Row: {
          id: string;
          identifier: string;
          action: string;
          count: number;
          window_start: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          identifier: string;
          action: string;
          count?: number;
          window_start?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          identifier?: string;
          action?: string;
          count?: number;
          window_start?: string;
          created_at?: string;
        };
      };
      requirement_emails: {
        Row: {
          id: string;
          requirement_id: string;
          recipient_email: string;
          recipient_name: string;
          sent_via: string;
          subject: string;
          body_preview: string | null;
          sent_date: string;
          status: string;
          match_confidence: number;
          created_by: string;
        };
        Insert: {
          id?: string;
          requirement_id: string;
          recipient_email: string;
          recipient_name: string;
          sent_via: string;
          subject: string;
          body_preview?: string | null;
          sent_date: string;
          status: string;
          match_confidence: number;
          created_by: string;
        };
        Update: {
          id?: string;
          requirement_id?: string;
          recipient_email?: string;
          recipient_name?: string;
          sent_via?: string;
          subject?: string;
          body_preview?: string | null;
          sent_date?: string;
          status?: string;
          match_confidence?: number;
          created_by?: string;
        };
      };
      branch_merges: {
        Row: {
          id: string;
          user_id: string;
          source_branch_id: string;
          target_branch_id: string;
          merged_branch_id: string | null;
          conflict_count: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source_branch_id: string;
          target_branch_id: string;
          merged_branch_id?: string | null;
          conflict_count?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          source_branch_id?: string;
          target_branch_id?: string;
          merged_branch_id?: string | null;
          conflict_count?: number | null;
          created_at?: string;
        };
      };
      user_feedback: {
        Row: {
          id: string;
          user_id: string;
          conversation_id: string | null;
          message_id: string | null;
          feedback_type: string | null;
          rating: number | null;
          comment: string | null;
          suggested_improvement: string | null;
          model_used: string | null;
          tokens_in_message: number | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          conversation_id?: string | null;
          message_id?: string | null;
          feedback_type?: string | null;
          rating?: number | null;
          comment?: string | null;
          suggested_improvement?: string | null;
          model_used?: string | null;
          tokens_in_message?: number | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          conversation_id?: string | null;
          message_id?: string | null;
          feedback_type?: string | null;
          rating?: number | null;
          comment?: string | null;
          suggested_improvement?: string | null;
          model_used?: string | null;
          tokens_in_message?: number | null;
        };
      };
      training_datasets: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          size: number | null;
          quality_score: number | null;
          status: string | null;
          is_ready: boolean;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          size?: number | null;
          quality_score?: number | null;
          status?: string | null;
          is_ready?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          description?: string | null;
          size?: number | null;
          quality_score?: number | null;
          status?: string | null;
          is_ready?: boolean;
        };
      };
      training_data_points: {
        Row: {
          id: string;
          user_id: string;
          dataset_id: string;
          message_id: string | null;
          input: string | null;
          output: string | null;
          category: string | null;
          difficulty: string | null;
          relevance: number | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          dataset_id: string;
          message_id?: string | null;
          input?: string | null;
          output?: string | null;
          category?: string | null;
          difficulty?: string | null;
          relevance?: number | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          dataset_id?: string;
          message_id?: string | null;
          input?: string | null;
          output?: string | null;
          category?: string | null;
          difficulty?: string | null;
          relevance?: number | null;
        };
      };
      external_services: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          service_type: string;
          endpoint: string;
          authentication: Json;
          triggers: Json;
          retry_policy: Json | null;
          timeout: number | null;
          rate_limit: number | null;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          service_type: string;
          endpoint: string;
          authentication: Json;
          triggers: Json;
          retry_policy?: Json | null;
          timeout?: number | null;
          rate_limit?: number | null;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          description?: string | null;
          service_type?: string;
          endpoint?: string;
          authentication?: Json;
          triggers?: Json;
          retry_policy?: Json | null;
          timeout?: number | null;
          rate_limit?: number | null;
          is_active?: boolean;
        };
      };
      service_integration_logs: {
        Row: {
          id: string;
          user_id: string;
          service_id: string;
          event: string | null;
          success: boolean | null;
          response_status: number | null;
          response_time: number | null;
          error: string | null;
          retry_count: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          service_id: string;
          event?: string | null;
          success?: boolean | null;
          response_status?: number | null;
          response_time?: number | null;
          error?: string | null;
          retry_count?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          service_id?: string;
          event?: string | null;
          success?: boolean | null;
          response_status?: number | null;
          response_time?: number | null;
          error?: string | null;
          retry_count?: number | null;
          created_at?: string;
        };
      };
      collaboration_sessions: {
        Row: {
          id: string;
          conversation_id: string;
          owner_id: string;
          participant_ids: string[];
          max_participants: number;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          owner_id: string;
          participant_ids: string[];
          max_participants: number;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          owner_id?: string;
          participant_ids?: string[];
          max_participants?: number;
          is_active?: boolean;
        };
      };
      user_presence: {
        Row: {
          id: string;
          session_id: string;
          user_id: string;
          username: string;
          status: string;
          cursor_position: number;
          last_activity: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          user_id: string;
          username: string;
          status: string;
          cursor_position?: number;
          last_activity?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          user_id?: string;
          username?: string;
          status?: string;
          cursor_position?: number;
          last_activity?: string;
        };
      };
      collaboration_events: {
        Row: {
          id: string;
          session_id: string;
          user_id: string;
          type: string;
          data: Json;
          sequence_number: number;
        };
        Insert: {
          id?: string;
          session_id: string;
          user_id: string;
          type: string;
          data: Json;
          sequence_number: number;
        };
        Update: {
          id?: string;
          session_id?: string;
          user_id?: string;
          type?: string;
          data?: Json;
          sequence_number?: number;
        };
      };
      voice_commands: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string;
          phrases: string[];
          category: string;
          action: string;
          parameters: Json | null;
          is_active: boolean;
          execution_count: number;
          success_rate: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description: string;
          phrases: string[];
          category: string;
          action: string;
          parameters?: Json | null;
          is_active?: boolean;
          execution_count?: number;
          success_rate?: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          description?: string;
          phrases?: string[];
          category?: string;
          action?: string;
          parameters?: Json | null;
          is_active?: boolean;
          execution_count?: number;
          success_rate?: number;
        };
      };
      command_execution_logs: {
        Row: {
          id: string;
          command_id: string;
          user_id: string;
          phrase_used: string;
          confidence: number;
          success: boolean;
          execution_time: number;
          result: Json | null;
          error: string | null;
        };
        Insert: {
          id?: string;
          command_id: string;
          user_id: string;
          phrase_used: string;
          confidence: number;
          success: boolean;
          execution_time: number;
          result?: Json | null;
          error?: string | null;
        };
        Update: {
          id?: string;
          command_id?: string;
          user_id?: string;
          phrase_used?: string;
          confidence?: number;
          success?: boolean;
          execution_time?: number;
          result?: Json | null;
          error?: string | null;
        };
      };
      domain_knowledge_bases: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          domain: string;
          description: string;
          is_public: boolean;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          domain: string;
          description: string;
          is_public?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          domain?: string;
          description?: string;
          is_public?: boolean;
        };
      };
      knowledge_entries: {
        Row: {
          id: string;
          kb_id: string;
          user_id: string;
          title: string;
          content: string;
          type: string;
          tags: string[];
          is_active: boolean;
          view_count: number;
        };
        Insert: {
          id?: string;
          kb_id: string;
          user_id: string;
          title: string;
          content: string;
          type: string;
          tags: string[];
          is_active?: boolean;
          view_count?: number;
        };
        Update: {
          id?: string;
          kb_id?: string;
          user_id?: string;
          title?: string;
          content?: string;
          type?: string;
          tags?: string[];
          is_active?: boolean;
          view_count?: number;
        };
      };
      conversation_memories: {
        Row: {
          id: string;
          conversation_id: string;
          user_id: string;
          short_term_memory: Json[];
          long_term_memory: Json[];
          working_memory: Json[];
          semantic_memory: Json;
          episodic_memory: Json[];
        };
        Insert: {
          id?: string;
          conversation_id: string;
          user_id: string;
          short_term_memory?: Json[];
          long_term_memory?: Json[];
          working_memory?: Json[];
          semantic_memory?: Json;
          episodic_memory?: Json[];
        };
        Update: {
          id?: string;
          conversation_id?: string;
          user_id?: string;
          short_term_memory?: Json[];
          long_term_memory?: Json[];
          working_memory?: Json[];
          semantic_memory?: Json;
          episodic_memory?: Json[];
        };
      };
      user_context_profiles: {
        Row: {
          id: string;
          user_id: string;
          communication_style: string;
          expertise: Json;
          interaction_patterns: Json;
          known_issues: Json[];
          goals: Json[];
        };
        Insert: {
          id?: string;
          user_id: string;
          communication_style: string;
          expertise?: Json;
          interaction_patterns?: Json;
          known_issues?: Json[];
          goals?: Json[];
        };
        Update: {
          id?: string;
          user_id?: string;
          communication_style?: string;
          expertise?: Json;
          interaction_patterns?: Json;
          known_issues?: Json[];
          goals?: Json[];
        };
      };
      sentiment_scores: {
        Row: {
          id: string;
          conversation_id: string;
          user_id: string;
          text: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          user_id: string;
          text: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          user_id?: string;
          text?: string;
        };
      };
      sentiment_issues: {
        Row: {
          id: string;
          conversation_id: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          user_id: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          user_id?: string;
        };
      };
      voice_emotion_scores: {
        Row: {
          id: string;
          conversation_id: string;
          user_id: string;
          audio_id: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          user_id: string;
          audio_id: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          user_id?: string;
          audio_id?: string;
        };
      };
      voice_health_metrics: {
        Row: {
          id: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          user_id: string;
        };
        Update: {
          id?: string;
          user_id?: string;
        };
      };
      bulk_email_campaigns: {
        Row: {
          id: string;
          user_id: string | null;
          requirement_id: string | null;
          subject: string | null;
          body: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          requirement_id?: string | null;
          subject?: string | null;
          body?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          requirement_id?: string | null;
          subject?: string | null;
          body?: string | null;
        };
      };
      campaign_recipients: {
        Row: {
          id: string;
          campaign_id: string;
          recipient_email: string;
          recipient_name: string | null;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          recipient_email: string;
          recipient_name?: string | null;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          recipient_email?: string;
          recipient_name?: string | null;
        };
      };
      bulk_email_campaign_status: {
        Row: {
          id: string;
          campaign_id: string;
          details: Json | null;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          details?: Json | null;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          details?: Json | null;
        };
      };
      email_accounts: {
        Row: {
          id: string;
          user_id: string;
          email: string;
          last_sync_at: string | null;
          sync_frequency_minutes: number | null;
          auto_link_confidence_level: number | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          email: string;
          last_sync_at?: string | null;
          sync_frequency_minutes?: number | null;
          auto_link_confidence_level?: number | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          email?: string;
          last_sync_at?: string | null;
          sync_frequency_minutes?: number | null;
          auto_link_confidence_level?: number | null;
        };
      };
      gmail_sync_tokens: {
        Row: {
          id: string;
          user_id: string;
          gmail_email: string;
          gmail_history_id: string | null;
          last_sync_at: string | null;
          sync_frequency_minutes: number | null;
          auto_link_confidence_level: string | null;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          user_id: string;
          gmail_email: string;
          gmail_history_id?: string | null;
          last_sync_at?: string | null;
          sync_frequency_minutes?: number | null;
          auto_link_confidence_level?: string | null;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          gmail_email?: string;
          gmail_history_id?: string | null;
          last_sync_at?: string | null;
          sync_frequency_minutes?: number | null;
          auto_link_confidence_level?: string | null;
          is_active?: boolean;
        };
      };
      email_sync_logs: {
        Row: {
          id: string;
          user_id: string;
          sync_type: string;
          status: string;
          message_count: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          sync_type: string;
          status: string;
          message_count?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          sync_type?: string;
          status?: string;
          message_count?: number | null;
          created_at?: string;
        };
      };
      finetune_models: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          base_model: string | null;
          description: string | null;
          accuracy: number | null;
          latency: number | null;
          cost_per_token: number | null;
          hyperparameters: Json | null;
          training_metrics: Json | null;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          base_model?: string | null;
          description?: string | null;
          accuracy?: number | null;
          latency?: number | null;
          cost_per_token?: number | null;
          hyperparameters?: Json | null;
          training_metrics?: Json | null;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          base_model?: string | null;
          description?: string | null;
          accuracy?: number | null;
          latency?: number | null;
          cost_per_token?: number | null;
          hyperparameters?: Json | null;
          training_metrics?: Json | null;
          is_active?: boolean;
        };
      };
      user_language_preferences: {
        Row: {
          id: string;
          user_id: string;
          language: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          language: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          language?: string;
        };
      };
      translation_cache: {
        Row: {
          id: string;
          user_id: string;
          source_lang: string;
          target_lang: string;
          source_text: string;
          translated_text: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source_lang: string;
          target_lang: string;
          source_text: string;
          translated_text: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          source_lang?: string;
          target_lang?: string;
          source_text?: string;
          translated_text?: string;
        };
      };
      conversation_branches: {
        Row: {
          id: string;
          user_id: string;
          parent_conversation_id: string | null;
          branch_point_index: number | null;
          title: string | null;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          user_id: string;
          parent_conversation_id?: string | null;
          branch_point_index?: number | null;
          title?: string | null;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          parent_conversation_id?: string | null;
          branch_point_index?: number | null;
          title?: string | null;
          is_active?: boolean;
        };
      };
      branch_messages: {
        Row: {
          id: string;
          branch_id: string;
          user_id: string;
          message_index: number;
          role: string;
          content: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          user_id: string;
          message_index: number;
          role: string;
          content: string;
        };
        Update: {
          id?: string;
          branch_id?: string;
          user_id?: string;
          message_index?: number;
          role?: string;
          content?: string;
        };
      };
      model_usage_stats: {
        Row: {
          id: string;
          user_id: string;
          model_id: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          model_id: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          model_id?: string;
        };
      };
      chat_analytics: {
        Row: {
          id: string;
          user_id: string;
          conversation_id: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          conversation_id: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          conversation_id?: string;
        };
      };
      conversation_exports: {
        Row: {
          id: string;
          user_id: string;
          conversation_id: string;
          format: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          conversation_id: string;
          format?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          conversation_id?: string;
          format?: string | null;
        };
      };
      custom_voice_commands: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          trigger_phrase: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          trigger_phrase: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          trigger_phrase?: string;
        };
      };
      wake_word_settings: {
        Row: {
          id: string;
          user_id: string;
          wake_word: string;
          sensitivity: number | null;
          is_enabled: boolean;
        };
        Insert: {
          id?: string;
          user_id: string;
          wake_word: string;
          sensitivity?: number | null;
          is_enabled?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          wake_word?: string;
          sensitivity?: number | null;
          is_enabled?: boolean;
        };
      };
      streaming_sessions: {
        Row: {
          id: string;
          user_id: string;
          session_type: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          session_type: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          session_type?: string;
        };
      };
      next_step_comments: {
        Row: {
          id: string;
          user_id: string;
          requirement_id: string;
          comment_text: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          requirement_id: string;
          comment_text: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          requirement_id?: string;
          comment_text?: string;
        };
      };
      chat_messages: {
        Row: {
          id: string;
          user_id: string;
          conversation_id: string;
          message: string;
          role: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          conversation_id: string;
          message: string;
          role: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          conversation_id?: string;
          message?: string;
          role?: string;
        };
      };
    };
    Functions: {
      get_users_by_ids: {
        Args: {
          p_user_ids: string[];
        };
        Returns: unknown;
      };
      search_requirements: {
        Args: {
          p_user_id: string;
          p_search_term: string;
          p_limit: number;
          p_offset: number;
        };
        Returns: unknown;
      };
      search_consultants: {
        Args: {
          p_search_term?: string;
        };
        Returns: unknown;
      };
      exec_sql: {
        Args: {
          sql: string;
        };
        Returns: unknown;
      };
      increment_command_usage: {
        Args: {
          command_id: string;
        };
        Returns: unknown;
      };
    };
  };
}
