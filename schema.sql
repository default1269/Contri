create table public.profiles (
  id uuid not null,
  email text not null,
  full_name text null,
  constraint profiles_pkey primary key (id),
  constraint profiles_email_key unique (email),
  constraint profiles_id_fkey foreign KEY (id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;


create table public.groups (
  id uuid not null default gen_random_uuid (),
  name text not null,
  created_by uuid not null,
  created_at timestamp with time zone not null default now(),
  constraint groups_pkey primary key (id),
  constraint groups_created_by_fkey foreign KEY (created_by) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;


create table public.group_members (
  group_id uuid not null,
  user_id uuid not null,
  role text not null default 'member'::text,
  joined_at timestamp with time zone not null default now(),
  constraint group_members_pkey primary key (group_id, user_id),
  constraint group_members_group_id_fkey foreign KEY (group_id) references groups (id) on delete CASCADE,
  constraint group_members_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE,
  constraint group_members_role_check check (
    (role = any (array['owner'::text, 'member'::text]))
  )
) TABLESPACE pg_default;

create index IF not exists group_members_user_id_idx on public.group_members using btree (user_id) TABLESPACE pg_default;

create table public.expenses (
  id uuid not null default gen_random_uuid (),
  group_id uuid not null,
  title text not null,
  amount numeric(12, 2) not null,
  paid_by uuid not null,
  created_by uuid not null,
  created_at timestamp with time zone not null default now(),
  constraint expenses_pkey primary key (id),
  constraint expenses_created_by_fkey foreign KEY (created_by) references auth.users (id) on delete CASCADE,
  constraint expenses_group_id_fkey foreign KEY (group_id) references groups (id) on delete CASCADE,
  constraint expenses_paid_by_fkey foreign KEY (paid_by) references auth.users (id),
  constraint expenses_amount_check check ((amount > (0)::numeric))
) TABLESPACE pg_default;

create index IF not exists expenses_group_id_idx on public.expenses using btree (group_id) TABLESPACE pg_default;

create table public.expense_splits (
  id uuid not null default gen_random_uuid (),
  expense_id uuid not null,
  user_id uuid not null,
  share_amount numeric(12, 2) not null,
  created_at timestamp with time zone not null default now(),
  constraint expense_splits_pkey primary key (id),
  constraint expense_splits_expense_id_user_id_key unique (expense_id, user_id),
  constraint expense_splits_expense_id_fkey foreign KEY (expense_id) references expenses (id) on delete CASCADE,
  constraint expense_splits_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE,
  constraint expense_splits_share_amount_check check ((share_amount >= (0)::numeric))
) TABLESPACE pg_default;

create table public.settlements (
  id uuid not null default gen_random_uuid (),
  group_id uuid not null,
  paid_by uuid not null,
  paid_to uuid not null,
  amount numeric(12, 2) not null,
  created_at timestamp with time zone not null default now(),
  constraint settlements_pkey primary key (id),
  constraint settlements_group_id_fkey foreign KEY (group_id) references groups (id) on delete CASCADE,
  constraint settlements_paid_by_fkey foreign KEY (paid_by) references auth.users (id),
  constraint settlements_paid_to_fkey foreign KEY (paid_to) references auth.users (id),
  constraint settlements_amount_check check ((amount > (0)::numeric)),
  constraint settlements_check check ((paid_by <> paid_to))
) TABLESPACE pg_default;

alter table public.expense_splits enable row level security;

alter table public.groups enable row level security;

alter table public.group_members enable row level security;

alter table public.expenses enable row level security;

alter table public.profiles enable row level security;

alter table public.settlements enable row level security;

CREATE OR REPLACE FUNCTION public.is_group_member(_group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members AS gm
    WHERE gm.group_id = _group_id
      AND gm.user_id = (SELECT auth.uid())
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_group_creator(_group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.groups AS g
    WHERE g.id = _group_id
      AND g.created_by = (SELECT auth.uid())
  );
$function$
;

CREATE OR REPLACE FUNCTION public.add_group_member_by_email(target_group_id uuid, target_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  target_user_id uuid;
BEGIN
  -- Require a logged-in user.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be logged in to add members.';
  END IF;

  -- Allow any existing group member, not just the owner.
  IF NOT EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = target_group_id
      AND gm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION
      'Only existing group members can add members.';
  END IF;

  -- Find the account associated with the supplied email.
  SELECT u.id
  INTO target_user_id
  FROM auth.users u
  WHERE lower(u.email) = lower(trim(target_email))
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION
      'No account found for this email. Ask the user to sign up first.';
  END IF;

  -- Prevent adding the same person twice.
  IF EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = target_group_id
      AND gm.user_id = target_user_id
  ) THEN
    RAISE EXCEPTION 'This user is already a member of the group.';
  END IF;

  -- Add the new person as a regular member.
  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (target_group_id, target_user_id, 'member');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
  )
  ON CONFLICT (id)
  DO UPDATE SET email = EXCLUDED.email;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_group_cascade(p_group_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Delete in order to respect foreign keys
  delete from public.expense_splits
  where expense_id in (select id from public.expenses where group_id = p_group_id);

  delete from public.expenses where group_id = p_group_id;
  delete from public.settlements where group_id = p_group_id;
  delete from public.group_members where group_id = p_group_id;
  delete from public.groups where id = p_group_id;

  return found;
end;
$function$
;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

create policy "Group members can insert expense splits" on public.expense_splits for INSERT to authenticated with check ((EXISTS ( SELECT 1
   FROM ((expenses e
     JOIN group_members creator ON ((creator.group_id = e.group_id)))
     JOIN group_members recipient ON ((recipient.group_id = e.group_id)))
  WHERE ((e.id = expense_splits.expense_id) AND (creator.user_id = auth.uid()) AND (recipient.user_id = expense_splits.user_id)))));

create policy "Members can view their own expense splits" on public.expense_splits for SELECT to authenticated using (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM (expenses e
     JOIN group_members gm ON ((gm.group_id = e.group_id)))
  WHERE ((e.id = expense_splits.expense_id) AND (gm.user_id = ( SELECT auth.uid() AS uid)))))));

create policy "Members can view groups" on public.groups for SELECT to authenticated using (((created_by = ( SELECT auth.uid() AS uid)) OR is_group_member(id)));

create policy "Owners can update groups" on public.groups for UPDATE to authenticated using ((created_by = ( SELECT auth.uid() AS uid))) with check ((created_by = ( SELECT auth.uid() AS uid)));

create policy "Users can create groups" on public.groups for INSERT to authenticated with check ((created_by = ( SELECT auth.uid() AS uid)));

create policy "Group creators can add members" on public.group_members for INSERT to authenticated with check ((is_group_creator(group_id) OR ((user_id = ( SELECT auth.uid() AS uid)) AND is_group_member(group_id))));

create policy "Members can view group memberships" on public.group_members for SELECT to authenticated using ((is_group_member(group_id) OR is_group_creator(group_id)));

create policy "Creators can delete expenses" on public.expenses for DELETE to authenticated using ((created_by = ( SELECT auth.uid() AS uid)));

create policy "Creators can update expenses" on public.expenses for UPDATE to authenticated using ((created_by = ( SELECT auth.uid() AS uid))) with check ((created_by = ( SELECT auth.uid() AS uid)));

create policy "Members can add expenses" on public.expenses for INSERT to authenticated with check (((created_by = ( SELECT auth.uid() AS uid)) AND is_group_member(group_id)));

create policy "Members can view expenses" on public.expenses for SELECT to authenticated using (is_group_member(group_id));

create policy "Group members can view fellow members' profiles" on public.profiles for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM (group_members viewer
     JOIN group_members target ON ((target.group_id = viewer.group_id)))
  WHERE ((viewer.user_id = auth.uid()) AND (target.user_id = profiles.id)))));

create policy "Users can insert own profile" on public.profiles for INSERT to authenticated with check ((id = ( SELECT auth.uid() AS uid)));

create policy "Users can insert their own profile" on public.profiles for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = id));

create policy "Users can update own profile" on public.profiles for UPDATE to authenticated using ((id = ( SELECT auth.uid() AS uid))) with check ((id = ( SELECT auth.uid() AS uid)));

create policy "Users can update their own profile" on public.profiles for UPDATE to authenticated using ((( SELECT auth.uid() AS uid) = id)) with check ((( SELECT auth.uid() AS uid) = id));

create policy "Users can view own profile" on public.profiles for SELECT to authenticated using ((id = ( SELECT auth.uid() AS uid)));

create policy "Group members can view settlements" on public.settlements for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM group_members gm
  WHERE ((gm.group_id = settlements.group_id) AND (gm.user_id = ( SELECT auth.uid() AS uid))))));

create policy "Members can record their own settlements" on public.settlements for INSERT to authenticated with check (((paid_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM group_members gm
  WHERE ((gm.group_id = settlements.group_id) AND (gm.user_id = ( SELECT auth.uid() AS uid))))) AND (EXISTS ( SELECT 1
   FROM group_members gm
  WHERE ((gm.group_id = settlements.group_id) AND (gm.user_id = settlements.paid_to))))));