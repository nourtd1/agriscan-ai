/**
 * useRecentScans — data hook for the horizontal thumbnail strip on CameraScreen.
 *
 * Fetches the five most-recent scans that belong to the currently authenticated
 * user from Supabase and exposes them alongside loading / error state.
 *
 * Use cases
 * ---------
 * - Render recent-scan thumbnails below the viewfinder so the farmer can
 *   quickly revisit a past result without navigating away.
 * - Re-fetch automatically after a new capture is saved (call `refresh()`).
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../config/database.types';

export type ScanRow = Database['public']['Tables']['scans']['Row'];

interface UseRecentScansResult {
  scans: ScanRow[];
  loading: boolean;
  error: string | null;
  /** Re-fetch from Supabase — call after saving a new scan. */
  refresh: () => void;
}

const RECENT_LIMIT = 5;

/**
 * Fetches the `RECENT_LIMIT` most-recent scans for the signed-in user.
 *
 * Returns an empty array (not an error) when the user has no scans yet.
 * Returns `error` as a human-readable string when the network/DB call fails.
 */
export function useRecentScans(): UseRecentScansResult {
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchScans = useCallback(async () => {
    setLoading(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setScans([]);
      setLoading(false);
      return;
    }

    const { data, error: dbError } = await supabase
      .from('scans')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(RECENT_LIMIT);

    if (dbError) {
      setError(dbError.message);
    } else {
      setScans(data ?? []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchScans();
  }, [fetchScans]);

  return { scans, loading, error, refresh: fetchScans };
}
