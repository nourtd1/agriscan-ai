/**
 * Tabs layout — defines the bottom tab bar and per-screen header options.
 *
 * The LanguageSelector pill strip is placed in `headerRight` on every tab
 * so the user can switch locale from anywhere in the app without navigating
 * to the profile screen.
 */

import React from 'react';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { Colors } from '../../config/colors';
import LanguageSelector from '../../features/i18n/LanguageSelector';
import { useLocale } from '../../features/i18n/LocaleContext';

/**
 * Shared `headerRight` component — renders the compact language selector pill.
 */
function HeaderLanguageSelector() {
  return (
    <View style={{ marginRight: 12 }}>
      <LanguageSelector compact />
    </View>
  );
}

/**
 * Tab navigator with AgriScan AI design tokens applied to the tab bar.
 */
export default function TabLayout() {
  const { t } = useLocale();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.accent + '33',
        },
        headerStyle: { backgroundColor: Colors.surface },
        headerTintColor: Colors.textPrimary,
        headerRight: () => <HeaderLanguageSelector />,
      }}
    >
      <Tabs.Screen
        name="scan"
        options={{ title: t('scan.title') }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: t('history.title') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t('profile.title') }}
      />
      {/* Hide legacy template screens from the tab bar */}
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="two" options={{ href: null }} />
    </Tabs>
  );
}
