/**
 * CameraScreen — live camera viewfinder with crop-disease scanning UX.
 *
 * Feature: Scan
 * -------------
 * This is the primary entry point for submitting a crop photo for AI diagnosis.
 * The screen serves two capture paths:
 *
 *  1. Live camera capture — the farmer points their phone at the affected plant
 *     and taps the circular "Scan Crop / Tanga Ifoto" button. A leaf-alignment
 *     guide box overlaid on the viewfinder helps frame the shot correctly.
 *
 *  2. Gallery upload — tapping "Upload from Gallery" opens the system photo
 *     picker so the farmer can submit an existing photo.
 *
 * After capture the URI is passed to the parent route via `router.push` so the
 * diagnosis screen can upload the image and call the Gemini API.
 *
 * Below the viewfinder a horizontal scroll strip shows the five most-recent
 * scans from Supabase, giving quick access to past results.
 *
 * Use cases
 * ---------
 * - First-time farmer opens the app and scans a diseased leaf.
 * - Farmer re-diagnoses the same plant a week later and compares results.
 * - Field agent uploads a batch of photos taken earlier offline.
 *
 * Permissions
 * -----------
 * Camera and media-library permissions are requested on mount. If denied the
 * screen shows a contextual prompt instead of crashing.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Camera, CameraType } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../config/colors';
import { useLocale } from '../i18n/LocaleContext';
import { useRecentScans } from './useRecentScans';
import type { ScanRow } from './useRecentScans';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Width/height of the leaf-alignment guide box as a fraction of screen width. */
const GUIDE_BOX_RATIO = 0.72;

/** Height of the recent-scans thumbnail strip. */
const THUMBNAIL_SIZE = 72;

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * GuideBox — the semi-transparent leaf-alignment overlay drawn on top of the
 * viewfinder. Corner accents reinforce the "frame your crop here" affordance
 * without obscuring too much of the live preview.
 *
 * @param label - Translated guide label string passed from parent.
 */
function GuideBox({ label }: { label: string }) {
  return (
    <View style={styles.guideWrapper} pointerEvents="none">
      {/* dimmed sides */}
      <View style={styles.guideDimTop} />
      <View style={styles.guideMiddleRow}>
        <View style={styles.guideDimSide} />
        <View style={styles.guideBox}>
          {/* corner accents */}
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
          <Text style={styles.guideLabel}>{label}</Text>
        </View>
        <View style={styles.guideDimSide} />
      </View>
      <View style={styles.guideDimBottom} />
    </View>
  );
}

/**
 * ScanThumbnail — a single item in the recent-scans horizontal strip.
 *
 * @param scan - The Supabase scan row to render.
 * @param onPress - Called when the user taps the thumbnail.
 */
function ScanThumbnail({
  scan,
  onPress,
}: {
  scan: ScanRow;
  onPress: (id: string) => void;
}) {
  return (
    <Pressable
      onPress={() => onPress(scan.id)}
      style={({ pressed }) => [styles.thumbnail, pressed && styles.thumbnailPressed]}
      accessibilityLabel={`Open scan from ${new Date(scan.created_at).toLocaleDateString()}`}
    >
      <Image
        source={{ uri: scan.image_url }}
        style={styles.thumbnailImage}
        resizeMode="cover"
      />
      {scan.status === 'needs_review' && (
        <View style={styles.thumbnailBadge}>
          <Text style={styles.thumbnailBadgeText}>!</Text>
        </View>
      )}
    </Pressable>
  );
}

/**
 * PermissionPrompt — shown in place of the viewfinder when camera permission
 * has been denied. Instructs the user to enable it in system settings.
 *
 * @param onRequest - Callback to re-trigger the native permission dialog.
 */
function PermissionPrompt({ onRequest }: { onRequest: () => void }) {
  return (
    <View style={styles.permissionContainer}>
      <Text style={styles.permissionIcon}>🌿</Text>
      <Text style={styles.permissionTitle}>Camera access needed</Text>
      <Text style={styles.permissionBody}>
        AgriScan needs your camera to photograph crops. Please grant access to
        continue.
      </Text>
      <Pressable onPress={onRequest} style={styles.permissionButton}>
        <Text style={styles.permissionButtonText}>Grant Permission</Text>
      </Pressable>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * CameraScreen — the root export mounted at `app/(tabs)/scan/index.tsx`.
 *
 * Orchestrates permission gating, the live CameraView, the guide-box overlay,
 * the capture button, the gallery picker, and the recent-scans strip.
 */
export default function CameraScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const cameraRef = useRef<Camera>(null);
  const [permission, requestPermission] = Camera.useCameraPermissions();
  const [isCapturing, setIsCapturing] = useState(false);
  const { scans, loading: scansLoading, refresh: refreshScans } = useRecentScans();

  // Request media-library permission on mount (needed for the gallery path on
  // Android; iOS asks lazily when the picker opens).
  useEffect(() => {
    if (Platform.OS === 'android') {
      ImagePicker.requestMediaLibraryPermissionsAsync();
    }
  }, []);

  /**
   * capturePhoto — fires the native camera shutter, reads back the URI, and
   * navigates to the diagnosis screen.
   *
   * Sets `isCapturing` while the shutter is processing to disable the button
   * and prevent double-taps.
   */
  const capturePhoto = useCallback(async () => {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        skipProcessing: false,
      });
      if (photo?.uri) {
        router.push({ pathname: '/scan-result/[id]', params: { id: 'new', uri: photo.uri } });
      }
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, router]);

  /**
   * pickFromGallery — opens the system image picker in single-image mode and
   * navigates to the diagnosis screen with the chosen URI.
   */
  const pickFromGallery = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      router.push({
        pathname: '/scan-result/[id]',
        params: { id: 'new', uri: result.assets[0].uri },
      });
    }
  }, [router]);

  /**
   * handleThumbnailPress — navigates to the scan-result detail screen for an
   * existing scan from the recent-scans strip.
   *
   * @param id - The UUID of the tapped scan row.
   */
  const handleThumbnailPress = useCallback(
    (id: string) => {
      router.push({ pathname: '/scan-result/[id]', params: { id } });
    },
    [router],
  );

  // ── Permission not yet resolved ──────────────────────────────────────────
  if (!permission) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // ── Permission denied ────────────────────────────────────────────────────
  if (!permission.granted) {
    return <PermissionPrompt onRequest={requestPermission} />;
  }

  // ── Main layout ──────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Viewfinder ── */}
      <View style={styles.viewfinderContainer}>
        <Camera ref={cameraRef} style={StyleSheet.absoluteFill} type={CameraType.back} />
        <GuideBox label={t('scan.guide_label')} />
      </View>

      {/* ── Controls panel ── */}
      <View style={[styles.controls, { paddingBottom: insets.bottom + 12 }]}>
        {/* Gallery button */}
        <Pressable
          onPress={pickFromGallery}
          style={({ pressed }) => [styles.galleryButton, pressed && styles.galleryButtonPressed]}
          accessibilityLabel={t('scan.gallery')}
          accessibilityRole="button"
        >
          <Text style={styles.galleryButtonText}>{t('scan.gallery')}</Text>
        </Pressable>

        {/* Circular capture button */}
        <Pressable
          onPress={capturePhoto}
          disabled={isCapturing}
          style={({ pressed }) => [
            styles.captureButton,
            pressed && styles.captureButtonPressed,
            isCapturing && styles.captureButtonDisabled,
          ]}
          accessibilityLabel={t('scan.cta')}
          accessibilityRole="button"
        >
          {isCapturing ? (
            <ActivityIndicator color={Colors.surface} size="small" />
          ) : (
            <Text style={styles.captureLabel}>{`${t('scan.cta')}\n${t('scan.cta_sub')}`}</Text>
          )}
        </Pressable>

        {/* Spacer to balance the gallery button on the left */}
        <View style={styles.galleryButton} />
      </View>

      {/* ── Recent scans strip ── */}
      <View style={styles.recentContainer}>
        <Text style={styles.recentTitle}>{t('scan.recent')}</Text>
        {scansLoading ? (
          <ActivityIndicator color={Colors.accent} style={{ marginTop: 8 }} />
        ) : scans.length === 0 ? (
          <Text style={styles.recentEmpty}>{t('scan.recent_empty')}</Text>
        ) : (
          <FlatList
            data={scans}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ScanThumbnail scan={item} onPress={handleThumbnailPress} />
            )}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recentList}
            onRefresh={refreshScans}
            refreshing={scansLoading}
          />
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CORNER_SIZE = 22;
const CORNER_THICKNESS = 3;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // ── Loading / permission ────────────────────────────────────────────────
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: Colors.background,
  },
  permissionIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 10,
    textAlign: 'center',
  },
  permissionBody: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  permissionButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 28,
  },
  permissionButtonText: {
    color: Colors.surface,
    fontWeight: '700',
    fontSize: 16,
  },

  // ── Viewfinder ─────────────────────────────────────────────────────────
  viewfinderContainer: {
    flex: 1,
    overflow: 'hidden',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },

  // ── Guide box overlay ──────────────────────────────────────────────────
  guideWrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
  },
  guideDimTop: {
    flex: 1,
    backgroundColor: Colors.overlay,
  },
  guideDimBottom: {
    flex: 1,
    backgroundColor: Colors.overlay,
  },
  guideMiddleRow: {
    flexDirection: 'row',
    // Make the guide box square by tying its width to a fraction of screen width.
    // The height is controlled by the aspectRatio on guideBox.
    alignItems: 'center',
  },
  guideDimSide: {
    flex: 1,
    // This view stretches vertically to match the guide box height via flexbox.
    alignSelf: 'stretch',
    backgroundColor: Colors.overlay,
  },
  guideBox: {
    width: `${GUIDE_BOX_RATIO * 100}%` as unknown as number,
    aspectRatio: 1,
    borderWidth: 1.5,
    borderColor: Colors.guideBorder,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 10,
  },
  guideLabel: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    letterSpacing: 0.4,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
  },

  // Corner accents
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: Colors.accent,
  },
  cornerTL: {
    top: -1,
    left: -1,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderTopLeftRadius: 10,
  },
  cornerTR: {
    top: -1,
    right: -1,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderTopRightRadius: 10,
  },
  cornerBL: {
    bottom: -1,
    left: -1,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderBottomLeftRadius: 10,
  },
  cornerBR: {
    bottom: -1,
    right: -1,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderBottomRightRadius: 10,
  },

  // ── Controls panel ─────────────────────────────────────────────────────
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    backgroundColor: Colors.background,
  },
  galleryButton: {
    width: 96,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    alignItems: 'center',
  },
  galleryButtonPressed: {
    backgroundColor: Colors.accent + '22',
  },
  galleryButtonText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Circular elevated capture button
  captureButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    // Elevation
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 10,
    // Outer ring
    borderWidth: 3,
    borderColor: Colors.accent,
  },
  captureButtonPressed: {
    transform: [{ scale: 0.95 }],
    shadowOpacity: 0.25,
  },
  captureButtonDisabled: {
    opacity: 0.65,
  },
  captureLabel: {
    color: Colors.surface,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 15,
    letterSpacing: 0.3,
  },

  // ── Recent scans strip ─────────────────────────────────────────────────
  recentContainer: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    backgroundColor: Colors.background,
  },
  recentTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  recentList: {
    gap: 10,
    paddingRight: 16,
  },
  recentEmpty: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  thumbnail: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: Colors.accent + '33',
  },
  thumbnailPressed: {
    opacity: 0.75,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  thumbnailBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailBadgeText: {
    color: Colors.surface,
    fontSize: 11,
    fontWeight: '800',
  },
});
