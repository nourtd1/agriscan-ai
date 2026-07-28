/**
 * Root layout — auth guard + navigation tree.
 * Unauthenticated users are redirected to /(auth)/sign-in.
 */

import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { LocaleProvider } from '../features/i18n/LocaleContext';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = { initialRouteName: '(tabs)' };

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, fontError] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => { if (fontError) throw fontError; }, [fontError]);
  useEffect(() => { if (loaded) SplashScreen.hideAsync(); }, [loaded]);

  if (!loaded) return null;

  return (
    <LocaleProvider>
      <RootNavigator />
    </LocaleProvider>
  );
}

function RootNavigator() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s));

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === undefined) return; // still loading

    const inAuth = segments[0] === '(auth)';

    if (!session && !inAuth) {
      // Not signed in — go to sign-in screen
      router.replace('/(auth)/sign-in');
    } else if (session && inAuth) {
      // Signed in — go to main app
      router.replace('/(tabs)/scan/index');
    }
  }, [session, segments, router]);

  return (
    <Stack>
      <Stack.Screen name="(auth)/sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
      <Stack.Screen name="scan-result/[id]/index" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
