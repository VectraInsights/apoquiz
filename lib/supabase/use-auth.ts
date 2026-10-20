"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { getSupabase, isSupabaseConfigured } from "./client";

export type AuthState = {
  user: User | null;
  loading: boolean;
  /** true quando as variaveis do Supabase estao configuradas */
  configured: boolean;
  /** Ultimo erro de login (ex.: provider nao ativado no painel) */
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

/**
 * Login com Google via Supabase. Sem as variaveis de ambiente o app
 * continua funcionando em modo local (localStorage).
 */
export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      // Sem configuracao o estado ja comeca como "nao carregando".
      return;
    }

    let active = true;

    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!active) return;
        setUser(data.user ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setLoading(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
      },
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    setError(null);
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      // O destino do login e a propria origem do app. Na Vercel vira
      // https://seu-app.vercel.app automaticamente - sem configuracao.
      options: { redirectTo: window.location.origin },
    });

    if (authError) {
      setError(
        authError.message.includes("provider is not enabled")
          ? "O login com Google ainda não foi ativado no painel do Supabase."
          : authError.message,
      );
    }
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  return {
    user,
    loading,
    configured: isSupabaseConfigured(),
    error,
    signIn,
    signOut,
  };
}
