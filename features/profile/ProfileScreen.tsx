/**
 * ProfileScreen — user settings and account information.
 *
 * Feature: Profile
 * ----------------
 * Displays:
 *   - Signed-in email address.
 *   - Language selector (full labels, not compact pills).
 *   - District text input (persisted to Supabase users.district).
 *   - App version.
 *   - Sign out button.
 *
 * Use cases
 * ---------
 * - Farmer updates their district after moving fields.
 * - Supervisor changes language to French for a review session.
 * - User signs out to hand the device to another farmer.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { Colors } from '../../config/colors';
import { useLocale } from '../i18n/LocaleContext';
import LanguageSelector from '../i18n/LanguageSelector';
import { supabase } from '../../lib/supabase';

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Renders the profile and settings screen.
 */
export default function ProfileScreen() {
  const { t } = useLocale();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState<string | null>(null);
  const [district, setDistrict] = useState('');
  const [districtSaving, setDistrictSaving] = useState(false);
  const [districtSaved, setDistrictSaved] = useState(false);

  // Load user data on mount.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      setEmail(user.email ?? null);

      const { data: profile } = await supabase
        .from('users')
        .select('district')
        .eq('id', user.id)
        .single();

      if (!cancelled && profile?.district) {
        setDistrict(profile.district);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  /**
   * Persists the district value to Supabase when the user finishes editing.
   */
  const saveDistrict = useCallback(async () => {
    if (!district.trim()) return;
    setDistrictSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('users')
        .update({ district: district.trim() })
        .eq('id', user.id);
    }
    setDistrictSaving(false);
    setDistrictSaved(true);
    setTimeout(() => setDistrictSaved(false), 2000);
  }, [district]);

  /**
   * Signs the user out via Supabase Auth and relies on the navigation guard
   * to redirect to onboarding.
   */
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + 32 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Account ── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('profile.signed_in_as')}</Text>
        <View style={styles.card}>
          <Text style={styles.emailText} numberOfLines={1}>
            {email ?? '…'}
          </Text>
        </View>
      </View>

      {/* ── Language ── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('profile.language')}</Text>
        <Text style={styles.sectionDesc}>{t('profile.language_desc')}</Text>
        <View style={styles.card}>
          <LanguageSelector />
        </View>
      </View>

      {/* ── District ── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('profile.district')}</Text>
        <View style={styles.card}>
          <TextInput
            value={district}
            onChangeText={setDistrict}
            onEndEditing={saveDistrict}
            placeholder={t('profile.district_placeholder')}
            placeholderTextColor={Colors.textSecondary}
            style={styles.districtInput}
            returnKeyType="done"
            onSubmitEditing={saveDistrict}
          />
          {districtSaving && (
            <ActivityIndicator
              size="small"
              color={Colors.accent}
              style={styles.districtIndicator}
            />
          )}
          {districtSaved && (
            <Text style={styles.savedText}>✓</Text>
          )}
        </View>
      </View>

      {/* ── Sign out ── */}
      <View style={styles.section}>
        <Pressable
          onPress={signOut}
          style={({ pressed }) => [
            styles.signOutButton,
            pressed && styles.signOutButtonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('profile.sign_out')}
        >
          <Text style={styles.signOutText}>{t('profile.sign_out')}</Text>
        </Pressable>
      </View>

      {/* ── Version ── */}
      <Text style={styles.versionText}>
        {t('profile.version')} {appVersion}
      </Text>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 8,
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  sectionDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 8,
    lineHeight: 17,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  emailText: {
    fontSize: 15,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  districtInput: {
    fontSize: 15,
    color: Colors.textPrimary,
    flex: 1,
    paddingVertical: 0,
  },
  districtIndicator: {
    position: 'absolute',
    right: 14,
    top: 14,
  },
  savedText: {
    position: 'absolute',
    right: 14,
    top: 14,
    color: Colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  signOutButton: {
    backgroundColor: Colors.error + '18',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.error + '50',
  },
  signOutButtonPressed: {
    opacity: 0.7,
  },
  signOutText: {
    color: Colors.error,
    fontSize: 15,
    fontWeight: '700',
  },
  versionText: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
});
