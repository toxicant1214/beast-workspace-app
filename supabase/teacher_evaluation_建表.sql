-- 教師考核 Phase 2：事件登記、LINE 確認、行政配合（任務逾期直接從老師任務計算）、年終試算
-- 只新增表，不改任何現有的表、欄位或權限。
-- 晨報、老師任務、請假流程都不會讀到這些表。
-- 用法：整份貼到 Supabase → SQL Editor → Run。重複執行不會出錯。
-- 權限：只有主管（teachers.role = 'admin'）能在網頁上讀寫；
--       老師的確認／異議走 LINE，由後端用 service role 寫入。

-- ---------- 判斷目前登入者是不是主管 ----------
create or replace function public.evaluation_is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.teachers t
    where t.auth_user_id = auth.uid() and t.role = 'admin'
  )
$$;
revoke all on function public.evaluation_is_admin() from public, anon;
grant execute on function public.evaluation_is_admin() to authenticated;

-- ---------- 工作區間（Phase 1 頁面用；已存在就不動） ----------
create table if not exists public.evaluation_work_periods (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  period_type  text not null default 'semester',
  start_date   date not null,
  end_date     date not null,
  is_active    boolean not null default true,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ---------- 事件類型（分數在「考核設定」可改） ----------
create table if not exists public.evaluation_event_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  direction   text not null check (direction in ('plus','minus')),
  points      numeric not null default 1,      -- 正數；扣分類型實際記為負分
  per_day     boolean not null default false,  -- 逾期：每天乘一次
  is_system   boolean not null default false,  -- 系統類型（逾期）不能刪
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

insert into public.evaluation_event_types (name, direction, points, per_day, is_system, sort_order) values
  ('遲到',     'minus', 1, false, false, 2),
  ('臨時請假', 'minus', 2, false, false, 3),
  ('工作疏失', 'minus', 2, false, false, 4),
  ('沒交接',   'minus', 3, false, false, 5),
  ('家長客訴', 'minus', 3, false, false, 6),
  ('安全問題', 'minus', 3, false, false, 7),
  ('主動代班', 'plus',  2, false, false, 11),
  ('支援活動', 'plus',  2, false, false, 12),
  ('家長稱讚', 'plus',  2, false, false, 13),
  ('額外貢獻', 'plus',  1, false, false, 14)
on conflict (name) do nothing;

-- ---------- 事件紀錄 ----------
create table if not exists public.evaluation_events (
  id                    uuid primary key default gen_random_uuid(),
  teacher_id            uuid not null references public.teachers(id) on delete cascade,
  event_date            date not null,
  type_id               uuid references public.evaluation_event_types(id) on delete set null,
  type_name             text not null,                 -- 登記當下的類型名稱
  direction             text not null check (direction in ('plus','minus')),
  points                numeric not null,              -- 實際分數（加分為正、扣分為負）
  overdue_days          int,
  note                  text,
  source                text not null default 'manual' check (source in ('manual','overdue')),
  source_ref            text,                          -- 逾期：teacher_assignment_members.id
  status                text not null default 'pending'
                          check (status in ('pending','confirmed','disputing','disputed','void')),
  confirmed_by          text check (confirmed_by in ('teacher','auto','admin','notice')),
  confirmed_at          timestamptz,
  dispute_requested_at  timestamptz,
  dispute_reason        text,
  admin_note            text,
  notified_at           timestamptz,
  notify_error          text,
  created_by            uuid default auth.uid(),
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

create unique index if not exists evaluation_events_overdue_uniq
  on public.evaluation_events(source, source_ref) where source_ref is not null;
create index if not exists evaluation_events_teacher_idx
  on public.evaluation_events(teacher_id, event_date);
create index if not exists evaluation_events_status_idx
  on public.evaluation_events(status);

-- ---------- 年終設定（級距、基本月數、組長加給、月薪） ----------
create table if not exists public.evaluation_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz default now()
);

insert into public.evaluation_settings (key, value) values
  ('year_end', '{
    "base_score": 100,
    "base_months": 1,
    "leader_bonus": 0,
    "auto_confirm_days": 3,
    "overdue_since": "2026-01-01",
    "overdue_per_day": 1,
    "bands": [
      {"min": 105, "factor": 1.3},
      {"min": 100, "factor": 1.1},
      {"min": 90,  "factor": 1.0},
      {"min": 80,  "factor": 0.8},
      {"min": -9999, "factor": 0.6}
    ],
    "salaries": {},
    "leaders": []
  }'::jsonb)
on conflict (key) do nothing;

-- ---------- 權限：只有主管 ----------
alter table public.evaluation_work_periods enable row level security;
alter table public.evaluation_event_types  enable row level security;
alter table public.evaluation_events       enable row level security;
alter table public.evaluation_settings     enable row level security;

drop policy if exists "evaluation_work_periods_admin" on public.evaluation_work_periods;
create policy "evaluation_work_periods_admin" on public.evaluation_work_periods
  for all to authenticated using (public.evaluation_is_admin()) with check (public.evaluation_is_admin());

drop policy if exists "evaluation_event_types_admin" on public.evaluation_event_types;
create policy "evaluation_event_types_admin" on public.evaluation_event_types
  for all to authenticated using (public.evaluation_is_admin()) with check (public.evaluation_is_admin());

drop policy if exists "evaluation_events_admin" on public.evaluation_events;
create policy "evaluation_events_admin" on public.evaluation_events
  for all to authenticated using (public.evaluation_is_admin()) with check (public.evaluation_is_admin());

drop policy if exists "evaluation_settings_admin" on public.evaluation_settings;
create policy "evaluation_settings_admin" on public.evaluation_settings
  for all to authenticated using (public.evaluation_is_admin()) with check (public.evaluation_is_admin());

notify pgrst, 'reload schema';

-- ===== v2：退班登記（原因＋是否列入留班率扣分）與加分類型 =====
create table if not exists public.evaluation_withdrawals (
  class_student_id uuid primary key references public.class_students(id) on delete cascade,
  reason      text,
  deduct      boolean not null default true,
  updated_at  timestamptz default now()
);
alter table public.evaluation_withdrawals enable row level security;
drop policy if exists "evaluation_withdrawals_admin" on public.evaluation_withdrawals;
create policy "evaluation_withdrawals_admin" on public.evaluation_withdrawals
  for all to authenticated using (public.evaluation_is_admin()) with check (public.evaluation_is_admin());

insert into public.evaluation_event_types (name, direction, points, per_day, is_system, sort_order) values
  ('挽回退班', 'plus', 3, false, false, 15),
  ('口碑招生', 'plus', 3, false, false, 16),
  ('跨部合作', 'plus', 1, false, false, 17)
on conflict (name) do nothing;
update public.evaluation_event_types set points = 1 where name in ('主動代班','支援活動') and points = 2;

notify pgrst, 'reload schema';
