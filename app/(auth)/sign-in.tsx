/**
 * Sign-in screen — email + password auth via Supabase.
 * For the demo: also offers a one-tap "Continue as Guest" that creates
 * an anonymous session so judges can test without an account.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../config/colors';

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');

  async function handleSubmit() {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setError('');

    const { error: authError } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    if (mode === 'signup') {
      setError('Account created! Check your email to confirm, then sign in.');
      setMode('signin');
      return;
    }

    // Ensure a users row exists.
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('users').upsert({ id: user.id }, { onConflict: 'id' });
    }

    router.replace('/(tabs)/scan/index');
  }

  async function handleGuest() {
    setLoading(true);
    setError('');
    const { data, error: authError } = await supabase.auth.signInAnonymously();
    setLoading(false);

    if (authError || !data.user) {
      // Anonymous auth might be disabled — fall back to a test account.
      setError('Guest sign-in unavailable. Please create an account.');
      return;
    }

    await supabase.from('users').upsert({ id: data.user.id }, { onConflict: 'id' });
    router.replace('/(tabs)/scan/index');
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Brand */}
        <View style={styles.brand}>
          <Text style={styles.logo}>🌿</Text>
          <Text style={styles.title}>AgriScan AI</Text>
          <Text style={styles.subtitle}>
            {mode === 'signin' ? 'Sign in to your account' : 'Create a new account'}
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email address"
            placeholderTextColor={Colors.textSecondary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="next"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={Colors.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.primaryBtnText}>
                  {mode === 'signin' ? 'Sign In' : 'Create Account'}
                </Text>
            }
          </Pressable>

          <Pressable
            style={styles.switchBtn}
            onPress={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(''); }}
          >
            <Text style={styles.switchText}>
              {mode === 'signin'
                ? "Don't have an account? Sign up"
                : 'Already have an account? Sign in'}
            </Text>
          </Pressable>
        </View>

        {/* Divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Guest / demo button */}
        <Pressable
          style={({ pressed }) => [styles.guestBtn, pressed && styles.btnPressed]}
          onPress={handleGuest}
          disabled={loading}
        >
          <Text style={styles.guestBtnText}>🎯  Continue as Demo Guest</Text>
        </Pressable>

        <Text style={styles.guestNote}>
          Guest mode lets judges test all features without an account.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 80,
    paddingBottom: 40,
  },
  brand: { alignItems: 'center', marginBottom: 40 },
  logo: { fontSize: 56, marginBottom: 12 },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.primary,
    marginBottom: 6,
  },
  subtitle: { fontSize: 15, color: Colors.textSecondary },
  form: { gap: 12 },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.textPrimary,
    borderWidth: 1.5,
    borderColor: Colors.accent + '40',
  },
  errorText: {
    color: Colors.error,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 28,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnPressed: { opacity: 0.75 },
  switchBtn: { paddingVertical: 10, alignItems: 'center' },
  switchText: { color: Colors.primary, fontSize: 14 },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
    gap: 10,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.accent + '40' },
  dividerText: { color: Colors.textSecondary, fontSize: 13 },
  guestBtn: {
    backgroundColor: Colors.warning,
    borderRadius: 28,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: Colors.warning,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  guestBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  guestNote: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 17,
  },
});
