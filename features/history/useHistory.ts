/**
 * useHistory — paginated, filterable scan history hook.
 *
 * Feature: History
 * ----------------
 * Fetches all scans belonging to the authenticated user from Supabase,
 * supports client-side filter tabs (All / Healthy / Needs Review / Verified),
 * and exposes a `refresh` callback for pull-to-refresh.
 *
 * Filter logic
 * ------------
 *   All          — no filter (all statuses)
 *   Healthy      — status in ["diagnosed"] AND diagnosis == "healthy"
 *                  (Gemini returns "healthy" for unaffected plants)
 *   Needs Review — status in ["needs_review", "pending"]
 *   Verified     — status == "verified"
 *
 * Use cases
 * ---------
 * - Farmer reviews past diagnoses to track field health over time.
 * - Field agent filters to "Needs Review" to action pending escalations.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../config/database.types';

export type ScanRow = Database['public']['Tables']['scans']['Row'];

export type HistoryFilter = 'all' | 'healthy' | 'needs_review' | 'verified';

interface UseHistoryResult {
  scans: ScanRow[];
  filtered: ScanRow[];
  loading: boolean;
  error: string | null;
  activeFilter: HistoryFilter;
  setFilter: (f: HistoryFilter) => void;
  refresh: () => void;
}

/**
 * Returns all scans for the current user plus filter/refresh controls.
 */
export function useHistory(): UseHistoryResult {
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<HistoryFilter>('all');

  const fetchScans = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setScans([]);
      setLoading(false);
      return;
    }

    const { data, error: dbErr } = await supabase
      .from('scans')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (dbErr) {
      setError(dbErr.message);
    } else {
      setScans(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchScans(); }, [fetchScans]);

  /**
   * Applies the active filter to the full scans list.
   * Client-side — no extra DB round-trips needed.
   */
  const filtered: ScanRow[] = scans.filter((s) => {
    switch (activeFilter) {
      case 'healthy':
        return (
          s.status === 'diagnosed' &&
          s.diagnosis?.toLowerCase() === 'healthy'
        );
      case 'needs_review':
        return s.status === 'needs_review' || s.status === 'pending';
      case 'verified':
        return s.status === 'verified';
      default:
        return true;
    }
  });

  return {
    scans,
    filtered,
    loading,
    error,
    activeFilter,
    setFilter: setActiveFilter,
    refresh: fetchScans,
  };
}
