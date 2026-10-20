-- ============================================================
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
  level         text,
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
