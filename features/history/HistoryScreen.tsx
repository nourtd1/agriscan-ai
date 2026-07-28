/**
 * HistoryScreen — filterable list of the user's past scans.
 *
 * Feature: History
 * ----------------
 * Shows every scan the user has ever submitted, grouped by status filter tabs:
 *   All / Healthy / Needs Review / Verified
 *
 * Each card shows:
 *   - Thumbnail (crop photo)
 *   - Diagnosis name (or "Pending" if not yet analysed)
 *   - Severity badge (colour-coded pill)
 *   - Verification status badge
 *   - Date scanned
 *
 * Tapping a card navigates to `/scan-result/<id>` to view the full result.
 *
 * Use cases
 * ---------
 * - Farmer tracks disease progression across multiple scans.
 * - Field agent filters to "Needs Review" to follow up on pending escalations.
 */

import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../config/colors';
import { useLocale } from '../i18n/LocaleContext';
import { useHistory, type HistoryFilter, type ScanRow } from './useHistory';
import type { ScanStatus, Severity } from '../../config/database.types';

// ─── Constants ────────────────────────────────────────────────────────────────

const FILTERS: HistoryFilter[] = ['all', 'healthy', 'needs_review', 'verified'];
const THUMB_SIZE = 72;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Maps a ScanStatus to a display colour for the status badge.
 *
 * @param status - The scan's current status.
 */
function statusColor(status: ScanStatus): string {
  switch (status) {
    case 'verified':    return Colors.accent;
    case 'needs_review':
    case 'pending':     return Colors.warning;
    case 'rejected':    return Colors.error;
    default:            return Colors.textSecondary;
  }
}

/**
 * Maps a Severity to a display colour for the severity pill.
 *
 * @param severity - The scan's severity value.
 */
function severityColor(severity: Severity | null): string {
  switch (severity) {
    case 'high':   return Colors.error;
    case 'medium': return Colors.warning;
    case 'low':    return Colors.accent;
    default:       return Colors.textSecondary;
  }
}

/**
 * Formats an ISO timestamp to a short locale date string.
 *
 * @param iso - ISO 8601 date string from Supabase.
 */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * FilterTab — a single filter pill in the horizontal tab bar.
 *
 * @param label    - Display label.
 * @param active   - Whether this tab is currently selected.
 * @param onPress  - Callback on tap.
 */
function FilterTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterTab,
        active && styles.filterTabActive,
        pressed && styles.filterTabPressed,
      ]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.filterTabText, active && styles.filterTabTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * ScanCard — a single scan row in the history list.
 *
 * @param scan    - The Supabase scan row.
 * @param onPress - Navigation callback.
 */
function ScanCard({
  scan,
  onPress,
}: {
  scan: ScanRow;
  onPress: (id: string) => void;
}) {
  const { t } = useLocale();

  const diagnosisLabel =
    scan.diagnosis
      ? scan.diagnosis.charAt(0).toUpperCase() + scan.diagnosis.slice(1)
      : t(`history.status_${scan.status}`);

  const statusKey = `history.status_${scan.status}` as const;
  const statusLabel = t(statusKey);

  return (
    <Pressable
      onPress={() => onPress(scan.id)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${diagnosisLabel}, ${statusLabel}, ${formatDate(scan.created_at)}`}
    >
      {/* Thumbnail */}
      <View style={styles.thumbContainer}>
        <Image
          source={{ uri: scan.image_url }}
          style={styles.thumb}
          resizeMode="cover"
        />
        {scan.severity && (
          <View
            style={[
              styles.severityDot,
              { backgroundColor: severityColor(scan.severity) },
            ]}
          />
        )}
      </View>

      {/* Text content */}
      <View style={styles.cardContent}>
        <Text style={styles.diagnosisName} numberOfLines={1}>
          {diagnosisLabel}
        </Text>

        <View style={styles.cardMeta}>
          {/* Status badge */}
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusColor(scan.status) + '22' },
            ]}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: statusColor(scan.status) },
              ]}
            />
            <Text
              style={[
                styles.statusBadgeText,
                { color: statusColor(scan.status) },
              ]}
            >
              {statusLabel}
            </Text>
          </View>
        </View>

        {/* Date */}
        <Text style={styles.dateText}>
          {t('history.date_label')} {formatDate(scan.created_at)}
        </Text>
      </View>

      {/* Chevron */}
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * HistoryScreen — root component mounted at `app/(tabs)/history/index.tsx`.
 */
export default function HistoryScreen() {
  const { t } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { filtered, loading, error, activeFilter, setFilter, refresh } =
    useHistory();

  /** Navigates to the full scan result screen. */
  const handleCardPress = useCallback(
    (id: string) => {
      router.push({ pathname: '/scan-result/[id]', params: { id } });
    },
    [router],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Filter tabs ── */}
      <View style={styles.filterBar}>
        {FILTERS.map((f) => (
          <FilterTab
            key={f}
            label={t(`history.filter_${f}`)}
            active={activeFilter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </View>

      {/* ── List / state ── */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => (
            <ScanCard scan={item} onPress={handleCardPress} />
          )}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 24 },
          ]}
          showsVerticalScrollIndicator={false}
          onRefresh={refresh}
          refreshing={loading}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🌿</Text>
              <Text style={styles.emptyTitle}>{t('history.empty')}</Text>
              <Text style={styles.emptySub}>{t('history.empty_sub')}</Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // ── Filter bar ────────────────────────────────────────────────────────────
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.accent + '30',
  },
  filterTab: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 20,
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.accent + '60',
  },
  filterTabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterTabPressed: {
    opacity: 0.7,
  },
  filterTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    letterSpacing: 0.3,
  },
  filterTabTextActive: {
    color: '#fff',
  },

  // ── List ──────────────────────────────────────────────────────────────────
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    flexGrow: 1,
  },
  separator: {
    height: 10,
  },

  // ── Scan card ─────────────────────────────────────────────────────────────
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.75,
  },
  thumbContainer: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 12,
    overflow: 'hidden',
    flexShrink: 0,
    backgroundColor: Colors.accent + '33',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  severityDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  cardContent: {
    flex: 1,
    gap: 5,
  },
  diagnosisName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  dateText: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  chevron: {
    fontSize: 22,
    color: Colors.accent,
    fontWeight: '300',
  },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },

  // ── States ────────────────────────────────────────────────────────────────
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    textAlign: 'center',
    padding: 24,
  },
});
