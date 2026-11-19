-- 請假流程（請假 → 排代理 → 交接 → 代理確認 → 完成）
-- 只新增兩張表，不改任何現有的表、欄位或權限。
-- 晨報、老師任務、行事曆都不會讀到這兩張表。
-- 流程完成時，才會在既有的 teacher_leave_records 新增一筆休假紀錄（跟「休假登記」寫入方式相同）。
-- 用法：整份貼到 Supabase → SQL Editor → Run。重複執行不會出錯。
-- （欄位型別會自動對齊現有 teachers / leave_types 等表的 id 型別）

do $$
declare
  t_teacher  text;
  t_type     text;
  t_record   text;
  t_external text;
begin
  select format_type(a.atttypid, a.atttypmod) into t_teacher
    from pg_attribute a where a.attrelid = 'public.teachers'::regclass and a.attname = 'id';
  select format_type(a.atttypid, a.atttypmod) into t_type
    from pg_attribute a where a.attrelid = 'public.leave_types'::regclass and a.attname = 'id';
  select format_type(a.atttypid, a.atttypmod) into t_record
    from pg_attribute a where a.attrelid = 'public.teacher_leave_records'::regclass and a.attname = 'id';
  select format_type(a.atttypid, a.atttypmod) into t_external
    from pg_attribute a where a.attrelid = 'public.leave_external_staff'::regclass and a.attname = 'id';

  execute format($f$
    create table if not exists public.leave_requests (
      id               uuid primary key default gen_random_uuid(),
      teacher_id       %1$s not null references public.teachers(id) on delete cascade,
      leave_type_id    %2$s not null references public.leave_types(id),
      start_date       date not null,
      end_date         date not null,
      input_unit       text not null default 'DAY' check (input_unit in ('DAY','HOUR')),
      input_value      numeric not null default 1,
      is_last_minute   boolean not null default false,
      reason           text,
      status           text not null default 'in_progress'
                         check (status in ('in_progress','completed','cancelled')),
      leave_record_id  %3$s references public.teacher_leave_records(id) on delete set null,
      created_by       uuid default auth.uid(),
      completed_at     timestamptz,
      completed_by     uuid,
      created_at       timestamptz default now(),
      updated_at       timestamptz default now()
    )$f$, t_teacher, t_type, t_record);

  -- 每一格「孩子 × 時段」的職責，以及代理人、交接單、代理確認
  execute format($f$
    create table if not exists public.leave_request_items (
      id                      uuid primary key default gen_random_uuid(),
      request_id              uuid not null references public.leave_requests(id) on delete cascade,
      item_date               date not null,
      start_time              time,
      end_time                time,
      category                text not null default 'other'
                                check (category in ('class','pickup','english','other')),
      title                   text not null,
      source_id               text,   -- 班級 id / 美語班 id（用來帶出學生名單）
      student_count           int default 0,
      substitute_teacher_id   %1$s references public.teachers(id) on delete set null,
      substitute_external_id  %2$s references public.leave_external_staff(id) on delete set null,
      handover_progress       text,
      handover_students       text,
      handover_parents        text,
      handover_materials      text,
      handover_done           boolean not null default false,
      handover_by_admin       boolean not null default false,
      ack_at                  timestamptz,
      ack_by                  uuid,
      ack_by_admin            boolean not null default false,
      sort_order              int default 0,
      created_at              timestamptz default now(),
      updated_at              timestamptz default now()
    )$f$, t_teacher, t_external);
end $$;

create index if not exists leave_requests_status_idx on public.leave_requests(status, start_date);
create index if not exists leave_request_items_request_idx on public.leave_request_items(request_id);
create index if not exists leave_request_items_sub_idx on public.leave_request_items(substitute_teacher_id, item_date);

-- 權限：登入的老師都可以讀寫（誰看得到由系統的「休假管理」頁面權限控制）
alter table public.leave_requests enable row level security;
alter table public.leave_request_items enable row level security;

drop policy if exists "leave_requests_authenticated" on public.leave_requests;
create policy "leave_requests_authenticated"
  on public.leave_requests for all to authenticated
  using (true) with check (true);

drop policy if exists "leave_request_items_authenticated" on public.leave_request_items;
create policy "leave_request_items_authenticated"
  on public.leave_request_items for all to authenticated
  using (true) with check (true);

-- 讓 API 立刻認得新表
notify pgrst, 'reload schema';

-- ===== 第二版：改成「每個孩子 × 時段」 =====
alter table public.leave_request_items
  add column if not exists students jsonb not null default '[]'::jsonb,
  add column if not exists slot_key text;

alter table public.leave_requests
  add column if not exists day_notes jsonb not null default '{}'::jsonb;

alter table public.leave_request_items drop constraint if exists leave_request_items_category_check;
alter table public.leave_request_items add constraint leave_request_items_category_check
  check (category in ('class','pickup','english','other','slot'));

notify pgrst, 'reload schema';

-- 第三版：排序可存小數（拆格子用）
alter table public.leave_request_items alter column sort_order type numeric using sort_order::numeric;
notify pgrst, 'reload schema';

-- 第四版：老師送出、主管確認
alter table public.leave_requests
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid;
notify pgrst, 'reload schema';

-- 第五版：紙本簽名單收回
alter table public.leave_requests
  add column if not exists paper_returned_at timestamptz;
notify pgrst, 'reload schema';

-- 第六版：代理人可以自己填名字（例如其他分校調來的老師）
alter table public.leave_request_items
  add column if not exists substitute_name text;
notify pgrst, 'reload schema';

-- 第七版：班級時段快速勾選活動（作業時間、多元課程）
alter table public.leave_request_items
  add column if not exists activity_tags jsonb not null default '[]'::jsonb;
notify pgrst, 'reload schema';

-- v8：代班確認單 PDF（私人空間，LINE 用 7 天簽名連結開啟）
insert into storage.buckets (id, name, public) values ('leave-sheets', 'leave-sheets', false) on conflict (id) do nothing;
drop policy if exists "leave_sheets_auth_rw" on storage.objects;
create policy "leave_sheets_auth_rw" on storage.objects for all to authenticated
  using (bucket_id = 'leave-sheets') with check (bucket_id = 'leave-sheets');
