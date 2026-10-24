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
  /** Login com e-mail e senha. Devolve o resultado para a interface. */
  signInWithEmail: (email: string, password: string) => Promise<AuthResult>;
  /** Cria a conta com e-mail e senha. */
  signUpWithEmail: (email: string, password: string) => Promise<AuthResult>;
};

export type AuthResult = {
  ok: boolean;
  /** Mensagem para a pessoa (erro, ou aviso de confirmacao de e-mail) */
  message: string | null;
  /** true quando a conta foi criada e falta confirmar o e-mail */
  needsConfirm: boolean;
};

/**
 * As mensagens do Supabase vem em ingles. Aqui sao traduzidas para as
 * situacoes que a pessoa realmente enfrenta.
 */
function traduzErro(mensagem: string): string {
  const m = mensagem.toLowerCase();

  if (m.includes("invalid login credentials")) {
    return "E-mail ou senha incorretos.";
  }
  if (m.includes("email not confirmed")) {
    return "Confirme o e-mail antes de entrar. Verifique a caixa de entrada e o spam.";
  }
  if (m.includes("user already registered")) {
    return "Já existe uma conta com este e-mail. Use \"Entrar\".";
  }
  if (m.includes("password should be at least")) {
    return "A senha precisa de pelo menos 6 caracteres.";
  }
  if (m.includes("signup requires a valid password")) {
    return "Digite uma senha válida (mínimo de 6 caracteres).";
  }
  if (m.includes("provider is not enabled")) {
    return "Este provedor de login não foi ativado no painel do Supabase.";
  }
  if (m.includes("unable to validate email address")) {
    return "Este e-mail não parece válido.";
  }
  if (m.includes("rate limit") || m.includes("too many requests")) {
    return "Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo.";
  }
  if (m.includes("security purposes") || m.includes("only request this after")) {
    return "Aguarde alguns segundos antes de tentar de novo.";
  }

  return mensagem;
}

/**
 * Login via Supabase: Google (OAuth) ou e-mail e senha. Sem as variaveis
 * de ambiente o app continua funcionando em modo local (localStorage).
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

  const signInWithEmail = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const supabase = getSupabase();
      if (!supabase) {
        return { ok: false, message: "Supabase não configurado.", needsConfirm: false };
      }
      setError(null);

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        const message = traduzErro(authError.message);
        setError(message);
        return { ok: false, message, needsConfirm: false };
      }

      return { ok: true, message: null, needsConfirm: false };
    },
    [],
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const supabase = getSupabase();
      if (!supabase) {
        return { ok: false, message: "Supabase não configurado.", needsConfirm: false };
      }
      setError(null);

      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (authError) {
        const message = traduzErro(authError.message);
        setError(message);
        return { ok: false, message, needsConfirm: false };
      }

      // Sem sessao = o projeto exige confirmacao do e-mail.
      if (!data.session) {
        return {
          ok: false,
          message:
            "Conta criada! Confirme o e-mail que enviamos para " +
            email.trim() +
            " (confira também o spam) e depois entre.",
          needsConfirm: true,
        };
      }

      return { ok: true, message: null, needsConfirm: false };
    },
    [],
  );

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
    signInWithEmail,
    signUpWithEmail,
  };
}
