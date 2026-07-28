// Hand-authored types that mirror the SQL schema in supabase/migrations/.
// Replace with `supabase gen types typescript` output once the CLI is configured.

export type ScanStatus = 'pending' | 'diagnosed' | 'needs_review' | 'verified' | 'rejected';
export type ReviewStatus = 'pending' | 'in_progress' | 'approved' | 'rejected';
export type Severity = 'low' | 'medium' | 'high';

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          district: string | null;
          preferred_language: string;
          created_at: string;
        };
        Insert: {
          id: string;
          district?: string | null;
          preferred_language?: string;
          created_at?: string;
        };
        Update: {
          district?: string | null;
          preferred_language?: string;
        };
      };
      scans: {
        Row: {
          id: string;
          user_id: string;
          image_url: string;
          crop_type: string | null;
          diagnosis: string | null;
          confidence: number | null;
          treatment_steps: string[];
          severity: Severity | null;
          status: ScanStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          image_url: string;
          crop_type?: string | null;
          diagnosis?: string | null;
          confidence?: number | null;
          treatment_steps?: string[];
          severity?: Severity | null;
          status?: ScanStatus;
          created_at?: string;
        };
        Update: {
          image_url?: string;
          crop_type?: string | null;
          diagnosis?: string | null;
          confidence?: number | null;
          treatment_steps?: string[];
          severity?: Severity | null;
          status?: ScanStatus;
        };
      };
      agronomist_reviews: {
        Row: {
          id: string;
          scan_id: string;
          agronomist_id: string | null;
          district: string;
          status: ReviewStatus;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          scan_id: string;
          agronomist_id?: string | null;
          district: string;
          status?: ReviewStatus;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          agronomist_id?: string | null;
          status?: ReviewStatus;
          notes?: string | null;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      scan_status: ScanStatus;
      review_status: ReviewStatus;
      severity: Severity;
    };
  };
}
