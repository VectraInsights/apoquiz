"use client";

import { useState } from "react";

const SQL = `-- ============================================================
-- ApoQuiz — esquema do Supabase
-- ============================================================
-- Como aplicar:
--   1. Crie o projeto em https://supabase.com/dashboard
--   2. Va em "SQL Editor" e cole este arquivo inteiro
--   3. Em "Authentication > Providers", ative o Google
--      (Client ID e Client Secret do Google Cloud Console)
--   4. Em "Authentication > URL Configuration", adicione
--      http://localhost:3000 e a URL da Vercel em "Redirect URLs"
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------
-- Quizzes salvos
-- ------------------------------------------------------------------
create table if not exists public.quizzes (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  title              text not null,
  source_file        text,
  created_at         timestamptz not null default now(),
  settings           jsonb not null default '{}'::jsonb,
  stats              jsonb not null default '{}'::jsonb,
  detected_gabarito  jsonb not null default '{}'::jsonb
);

create index if not exists quizzes_user_created_idx
  on public.quizzes (user_id, created_at desc);

-- ------------------------------------------------------------------
-- Questoes (uma linha por questao)
-- ------------------------------------------------------------------
create table if not exists public.quiz_questions (
  quiz_id       uuid not null references public.quizzes(id) on delete cascade,
  position      int  not null,
  qid           text,
  number        int,
  statement     text not null,
  options       jsonb not null default '[]'::jsonb,
  correct       text,
  explanation   text,
  option_notes  jsonb,
  topic         text,
  answer_source text,
  page          int,
  section       text,
  primary key (quiz_id, position)
);

-- ------------------------------------------------------------------
-- Progresso de cada quiz
-- ------------------------------------------------------------------
create table if not exists public.quiz_states (
  quiz_id          uuid primary key references public.quizzes(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  answers          jsonb not null default '{}'::jsonb,
  flagged          jsonb not null default '[]'::jsonb,
  current_index    int not null default 0,
  started_at       timestamptz,
  finished_at      timestamptz,
  elapsed_seconds  int not null default 0,
  updated_at       timestamptz not null default now()
);

create index if not exists quiz_states_user_idx
  on public.quiz_states (user_id);

-- ------------------------------------------------------------------
-- Seguranca: cada usuario so enxerga o que e dele
-- ------------------------------------------------------------------
alter table public.quizzes       enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_states   enable row level security;

drop policy if exists "quizzes: proprio" on public.quizzes;
create policy "quizzes: proprio" on public.quizzes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "quiz_states: proprio" on public.quiz_states;
create policy "quiz_states: proprio" on public.quiz_states
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- As questoes sao acessadas via o quiz dono
drop policy if exists "quiz_questions: via quiz" on public.quiz_questions;
create policy "quiz_questions: via quiz" on public.quiz_questions
  for all
  using (
    exists (
      select 1 from public.quizzes q
      where q.id = quiz_id and q.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.quizzes q
      where q.id = quiz_id and q.user_id = auth.uid()
    )
  );
`;

export default function SupabaseSetup() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SQL);
    } catch {
      const area = document.createElement("textarea");
      area.value = SQL;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold">Ativar o Supabase do ApoQuiz</h1>

      <ol className="mt-6 space-y-3 text-sm leading-relaxed text-ink-muted">
        <li>
          <strong className="text-ink">1.</strong> Abra{" "}
          <a
            className="text-brand-soft underline"
            href="https://supabase.com/dashboard/project/gxzzcdywhjhasjttklry/sql/new"
            target="_blank"
            rel="noreferrer"
          >
            SQL Editor do seu projeto
          </a>{" "}
          e clique em <em>New query</em>.
        </li>
        <li>
          <strong className="text-ink">2.</strong> Clique em{" "}
          <em>Copiar SQL</em> abaixo e cole na área de edição.
        </li>
        <li>
          <strong className="text-ink">3.</strong> Clique em <em>Run</em>. Deve
          aparecer <em>Success. No rows returned</em>.
        </li>
        <li>
          <strong className="text-ink">4.</strong> Em{" "}
          <em>Authentication → Providers → Google</em>, ative o Google com o
          Client ID e o Client Secret do Google Cloud Console.
        </li>
        <li>
          <strong className="text-ink">4.</strong> Em{" "}
          <em>Authentication → URL Configuration</em>: <strong>Site URL</strong> ={" "}
          <code className="text-brand-soft">
            https://SEU-PROJETO.vercel.app
          </code>{" "}
          e em <strong>Redirect URLs</strong> adicione{" "}
          <code className="text-brand-soft">
            https://*-SEU-TIME.vercel.app/**
          </code>
          . O Supabase aceita curinga; o Google não.
        </li>
        <li>
          <strong className="text-ink">5.</strong> No{" "}
          <a
            className="text-brand-soft underline"
            href="https://console.cloud.google.com/auth/clients"
            target="_blank"
            rel="noreferrer"
          >
            Google Cloud
          </a>
          , crie um OAuth Client do tipo <em>Web application</em>:
          <ul className="mt-1 list-disc pl-5 text-ink-faint">
            <li>
              <strong>Authorized redirect URIs</strong>:{" "}
              <code className="text-brand-soft">
                https://gxzzcdywhjhasjttklry.supabase.co/auth/v1/callback
              </code>
            </li>
            <li>
              <strong>Authorized JavaScript origins</strong>:{" "}
              <code className="text-brand-soft">
                https://SEU-PROJETO.vercel.app
              </code>{" "}
              — sem curinga, sem caminho e sem barra final: o Google exige a
              origem exata. A URL do app é a que aparece na barra de endereço
              (Vercel → projeto → Deployments → produção).
            </li>
          </ul>
        </li>
      </ol>

      <button
        type="button"
        onClick={copy}
        className="btn btn-primary mt-6"
      >
        {copied ? "SQL copiado!" : "Copiar SQL"}
      </button>

      <pre className="panel mt-4 max-h-96 overflow-auto p-4 text-[11px] leading-relaxed text-ink-muted">
        {SQL}
      </pre>
    </main>
  );
}
