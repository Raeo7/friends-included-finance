-- Friends Included finance schema. Run once in the Supabase SQL editor.
-- The app talks to these tables only from the server with the service role key.
-- RLS is enabled with no policies, so the public anon key cannot read or write anything.

create table if not exists public.sales (
  ref text primary key check (ref ~ '^[A-Z0-9][A-Z0-9_-]{0,19}$'),
  submitted_at timestamptz not null default now(),
  salesperson text not null check (salesperson in ('richard', 'anastasia', 'jean-claude')),
  customer text not null check (length(trim(customer)) > 0),
  project text not null check (project in ('A', 'B')),
  description text not null check (length(trim(description)) > 0),
  amount_cents bigint not null check (amount_cents > 0),
  proposed_richard_bp integer not null check (proposed_richard_bp between 0 and 10000),
  proposed_anastasia_bp integer not null check (proposed_anastasia_bp between 0 and 10000),
  proposed_jean_claude_bp integer not null check (proposed_jean_claude_bp between 0 and 10000),
  approved_richard_bp integer check (approved_richard_bp between 0 and 10000),
  approved_anastasia_bp integer check (approved_anastasia_bp between 0 and 10000),
  approved_jean_claude_bp integer check (approved_jean_claude_bp between 0 and 10000),
  commission_richard_cents bigint,
  commission_anastasia_cents bigint,
  commission_jean_claude_cents bigint,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  decided_at timestamptz,
  source text not null check (source in ('telegram', 'web')),
  origin_chat_id text,
  notify_status text not null default 'not_required'
    check (notify_status in ('not_required', 'sent', 'failed', 'no_recipient')),
  notify_chat_id text,
  notify_error text,
  sync_status text not null default 'pending' check (sync_status in ('pending', 'synced', 'failed')),
  sync_error text,
  constraint proposed_split_total check (
    proposed_richard_bp + proposed_anastasia_bp + proposed_jean_claude_bp = 10000
  ),
  constraint approved_split_complete check (
    (status = 'pending' and approved_richard_bp is null and commission_richard_cents is null)
    or (
      status = 'approved'
      and coalesce(approved_richard_bp + approved_anastasia_bp + approved_jean_claude_bp, -1)
        = 10000
      and coalesce(
        commission_richard_cents + commission_anastasia_cents + commission_jean_claude_cents, -1
      ) = round(amount_cents * 0.10)
    )
  )
);

create table if not exists public.expenses (
  ref text primary key check (ref ~ '^[A-Z0-9][A-Z0-9_-]{0,19}$'),
  submitted_at timestamptz not null default now(),
  reporter text not null check (reporter = 'kevin'),
  description text not null check (length(trim(description)) > 0),
  category text not null check (category in ('Materials', 'Travel', 'Other')),
  amount_cents bigint not null check (amount_cents > 0),
  proposed_allocation text not null check (proposed_allocation in ('A', 'B', 'overhead')),
  final_allocation text check (final_allocation in ('A', 'B', 'overhead')),
  status text not null check (status in ('awaiting_allocation', 'allocated')),
  decided_at timestamptz,
  source text not null check (source in ('telegram', 'web')),
  origin_chat_id text,
  notify_status text not null default 'not_required'
    check (notify_status in ('not_required', 'sent', 'failed', 'no_recipient')),
  notify_chat_id text,
  notify_error text,
  sync_status text not null default 'pending' check (sync_status in ('pending', 'synced', 'failed')),
  sync_error text,
  constraint allocation_matches_status check (
    (status = 'awaiting_allocation' and final_allocation is null)
    or (status = 'allocated' and final_allocation is not null)
  )
);

-- A reference is unique across sales and expenses.
create or replace function public.refuse_cross_table_ref() returns trigger
language plpgsql as $$
begin
  if tg_table_name = 'sales' and exists (select 1 from public.expenses where ref = new.ref) then
    raise exception 'duplicate reference %', new.ref using errcode = '23505';
  end if;
  if tg_table_name = 'expenses' and exists (select 1 from public.sales where ref = new.ref) then
    raise exception 'duplicate reference %', new.ref using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists sales_unique_ref on public.sales;
create trigger sales_unique_ref before insert on public.sales
  for each row execute function public.refuse_cross_table_ref();
drop trigger if exists expenses_unique_ref on public.expenses;
create trigger expenses_unique_ref before insert on public.expenses
  for each row execute function public.refuse_cross_table_ref();

create table if not exists public.telegram_links (
  telegram_user_id text primary key,
  employee_id text not null unique
    check (employee_id in ('richard', 'anastasia', 'jean-claude', 'kevin', 'svetlana')),
  chat_id text not null,
  linked_at timestamptz not null default now()
);

create table if not exists public.telegram_contacts (
  telegram_user_id text primary key,
  chat_id text not null,
  display_name text not null,
  last_seen_at timestamptz not null default now()
);

create table if not exists public.settings (
  id integer primary key default 1 check (id = 1),
  simulate_sheets_failure boolean not null default false,
  simulate_telegram_failure boolean not null default false
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

alter table public.sales enable row level security;
alter table public.expenses enable row level security;
alter table public.telegram_links enable row level security;
alter table public.telegram_contacts enable row level security;
alter table public.settings enable row level security;
