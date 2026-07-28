/**
 * Tabs layout — custom tab bar with icons + branded header.
 */

import React from 'react';
import { Tabs } from 'expo-router';
import {
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../config/colors';
import LanguageSelector from '../../features/i18n/LanguageSelector';
import { useLocale } from '../../features/i18n/LocaleContext';

// ─── Tab icon ────────────────────────────────────────────────────────────────

function TabIcon({
  emoji,
  label,
  focused,
}: {
  emoji: string;
  label: string;
  focused: boolean;
}) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Text style={styles.iconEmoji}>{emoji}</Text>
      {focused && <View style={styles.iconDot} />}
    </View>
  );
}

// ─── Custom header ────────────────────────────────────────────────────────────

function AppHeader({ title }: { title: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
      {/* Left: brand */}
      <View style={styles.headerBrand}>
        <View style={styles.headerLogoCircle}>
          <Text style={styles.headerLogoEmoji}>🌿</Text>
        </View>
        <View>
          <Text style={styles.headerAppName}>AgriScan AI</Text>
          <Text style={styles.headerScreenName}>{title}</Text>
        </View>
      </View>
      {/* Right: language selector — white pills on dark header */}
      <LanguageSelector compact onDark />
    </View>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function TabLayout() {
  const { t } = useLocale();

  return (
    <Tabs
      screenOptions={{
        // Use our custom header instead of the default one
        header: ({ route }) => {
          const titles: Record<string, string> = {
            'scan/index': t('scan.title'),
            'history/index': t('history.title'),
            'profile/index': t('profile.title'),
          };
          return <AppHeader title={titles[route.name] ?? ''} />;
        },
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: true,
        tabBarLabelStyle: styles.tabLabel,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="scan/index"
        options={{
          title: t('scan.title'),
          tabBarLabel: t('scan.title'),
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="📷" label={t('scan.title')} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="history/index"
        options={{
          title: t('history.title'),
          tabBarLabel: t('history.title'),
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="🗂️" label={t('history.title')} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile/index"
        options={{
          title: t('profile.title'),
          tabBarLabel: t('profile.title'),
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="👤" label={t('profile.title')} focused={focused} />
          ),
        }}
      />
      {/* Hide legacy template screens */}
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="two" options={{ href: null }} />
    </Tabs>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Shadow
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerLogoCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  headerLogoEmoji: {
    fontSize: 18,
  },
  headerAppName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
    lineHeight: 19,
  },
  headerScreenName: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // ── Tab bar ──────────────────────────────────────────────────────────────────
  tabBar: {
    backgroundColor: Colors.surface,
    borderTopWidth: 0,
    height: Platform.OS === 'ios' ? 82 : 64,
    paddingBottom: Platform.OS === 'ios' ? 20 : 8,
    paddingTop: 8,
    // Shadow above the bar
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 16,
  },
  tabItem: {
    paddingTop: 4,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },

  // ── Tab icon ─────────────────────────────────────────────────────────────────
  iconWrap: {
    width: 40,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  iconWrapActive: {
    backgroundColor: Colors.primary + '15',
  },
  iconEmoji: {
    fontSize: 22,
  },
  iconDot: {
    position: 'absolute',
    bottom: 1,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
});
