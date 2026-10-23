-- Create a function to cascade delete a group
create or replace function public.delete_group_cascade(p_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
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
$$;

-- Allow authenticated users to execute
grant execute on function public.delete_group_cascade(uuid) to authenticated;
