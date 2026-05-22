-- MIMI Servicios - RLS/base hardening
-- Scope: service tables only. Transport/driver tables are excluded except for
-- removing legacy driver access from Servicios payment policies.

begin;

do $$
declare
  r record;
begin
  for r in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and (
        c.relname like 'svc_%'
        or c.relname in (
          'admin_users',
          'audit_logs',
          'audit_financial_events',
          'auth_device_trust',
          'auth_verification_challenges',
          'commission_rules',
          'customer_account_actions',
          'customer_admin_notes',
          'customer_identity_checks',
          'customer_identity_evidence',
          'customer_risk_signals',
          'customer_trust_profiles',
          'customer_verification_events',
          'customer_verification_requests',
          'device_reputation',
          'document_hashes',
          'financial_accounts',
          'financial_operation_locks',
          'fraud_events',
          'legal_acceptances',
          'legal_documents',
          'legal_versions',
          'payment_events',
          'payment_processor_events',
          'payment_provider_config',
          'payment_reconciliations',
          'payments',
          'refunds',
          'settlements',
          'payout_batch_items',
          'payout_batches',
          'payout_events',
          'payouts',
          'provider_earnings',
          'provider_payout_account_events',
          'provider_payout_account_verifications',
          'provider_payout_accounts',
          'provider_wallet_events',
          'provider_wallets',
          'push_tokens',
          'risk_scores',
          'wallet_balances',
          'wallet_reservations',
          'wallets'
        )
      )
  loop
    execute format('alter table %I.%I enable row level security', r.schema_name, r.table_name);
    execute format('revoke all privileges on table %I.%I from anon, authenticated', r.schema_name, r.table_name);
  end loop;
end $$;

-- Catalog/discovery reads that are intentionally public.
grant select on table
  public.svc_categories,
  public.svc_category_relations,
  public.svc_provider_document_requirements,
  public.svc_provider_service_offerings,
  public.svc_service_intent_rules
to anon, authenticated;

-- Authenticated reads for own/admin-scoped service surfaces.
grant select on table
  public.admin_users,
  public.auth_device_trust,
  public.auth_verification_challenges,
  public.audit_financial_events,
  public.audit_logs,
  public.commission_rules,
  public.customer_account_actions,
  public.customer_admin_notes,
  public.customer_identity_checks,
  public.customer_identity_evidence,
  public.customer_risk_signals,
  public.customer_trust_profiles,
  public.customer_verification_events,
  public.customer_verification_requests,
  public.device_reputation,
  public.document_hashes,
  public.financial_accounts,
  public.financial_operation_locks,
  public.fraud_events,
  public.legal_acceptances,
  public.legal_documents,
  public.legal_versions,
  public.payment_events,
  public.payment_processor_events,
  public.payment_provider_config,
  public.payment_reconciliations,
  public.payments,
  public.refunds,
  public.settlements,
  public.payout_batch_items,
  public.payout_batches,
  public.payout_events,
  public.payouts,
  public.provider_earnings,
  public.provider_payout_account_events,
  public.provider_payout_account_verifications,
  public.provider_payout_accounts,
  public.provider_wallet_events,
  public.provider_wallets,
  public.push_tokens,
  public.risk_scores,
  public.svc_assignments,
  public.svc_category_discovery_events,
  public.svc_client_profiles,
  public.svc_conversations,
  public.svc_escrow_holds,
  public.svc_financial_ledger,
  public.svc_idempotency_keys,
  public.svc_messages,
  public.svc_notification_deliveries,
  public.svc_notifications,
  public.svc_payment_intents,
  public.svc_platform_config,
  public.svc_provider_availability,
  public.svc_provider_categories,
  public.svc_provider_credentials,
  public.svc_provider_documents,
  public.svc_provider_identity_checks,
  public.svc_provider_intents,
  public.svc_provider_pricing,
  public.svc_provider_profiles,
  public.svc_providers,
  public.svc_request_candidates,
  public.svc_request_events,
  public.svc_request_offers,
  public.svc_requests,
  public.svc_reviews,
  public.svc_scheduled_events,
  public.svc_tracking,
  public.svc_user_devices,
  public.wallet_balances,
  public.wallet_reservations,
  public.wallets
to authenticated;

-- Direct authenticated writes still used by the Servicios frontends.
grant insert on table public.audit_logs to authenticated;
grant insert on table public.legal_acceptances to authenticated;
grant insert on table public.svc_conversations to authenticated;
grant insert on table public.svc_reviews to authenticated;
grant insert on table public.svc_provider_documents to authenticated;
grant insert on table public.svc_provider_intents to authenticated;
grant insert on table public.svc_providers to authenticated;
grant insert on table public.svc_provider_availability to authenticated;
grant insert on table public.svc_provider_categories to authenticated;
grant insert on table public.svc_provider_credentials to authenticated;
grant insert on table public.svc_provider_pricing to authenticated;
grant insert on table public.svc_provider_profiles to authenticated;
grant insert on table public.svc_provider_service_offerings to authenticated;
grant insert on table public.push_tokens to authenticated;
grant insert on table public.svc_user_devices to authenticated;

grant update on table public.svc_notifications to authenticated;
grant update on table public.svc_provider_intents to authenticated;
grant update on table public.svc_providers to authenticated;
grant update on table public.svc_provider_availability to authenticated;
grant update on table public.svc_provider_categories to authenticated;
grant update on table public.svc_provider_credentials to authenticated;
grant update on table public.svc_provider_pricing to authenticated;
grant update on table public.svc_provider_profiles to authenticated;
grant update on table public.svc_provider_service_offerings to authenticated;
grant update on table public.push_tokens to authenticated;
grant update on table public.svc_user_devices to authenticated;

-- Audit: users may create their own non-system audit entries; system/admin
-- writes stay behind Edge Functions/service role or admin policy.
drop policy if exists "system_can_insert_audit_logs" on public.audit_logs;
drop policy if exists "audit_logs_users_insert_own_safe" on public.audit_logs;
create policy "audit_logs_users_insert_own_safe"
on public.audit_logs
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and coalesce(actor_type, 'user') not in ('system', 'admin')
);

-- Servicios payments must not grant visibility through legacy transport driver identity.
drop policy if exists "payments_customer_provider_admin_read" on public.payments;
create policy "payments_customer_provider_admin_read"
on public.payments
for select
to authenticated
using (
  customer_id = (select auth.uid())
  or provider_id = public.mimi_current_service_provider_id()
  or public.is_admin_user((select auth.uid()))
);

drop policy if exists "payment_events_participant_read" on public.payment_events;
create policy "payment_events_participant_read"
on public.payment_events
for select
to authenticated
using (
  exists (
    select 1
    from public.payments p
    where p.id = payment_events.payment_id
      and (
        p.customer_id = (select auth.uid())
        or p.provider_id = public.mimi_current_service_provider_id()
        or public.is_admin_user((select auth.uid()))
      )
  )
);

drop policy if exists "refunds_participant_read" on public.refunds;
create policy "refunds_participant_read"
on public.refunds
for select
to authenticated
using (
  exists (
    select 1
    from public.payments p
    where p.id = refunds.payment_id
      and (
        p.customer_id = (select auth.uid())
        or p.provider_id = public.mimi_current_service_provider_id()
        or public.is_admin_user((select auth.uid()))
      )
  )
);

drop policy if exists "settlements_provider_admin_read" on public.settlements;
create policy "settlements_provider_admin_read"
on public.settlements
for select
to authenticated
using (
  provider_id = public.mimi_current_service_provider_id()
  or public.is_admin_user((select auth.uid()))
);

-- Conversations: split broad ALL policy. Direct browser insert is allowed only
-- for own support conversations; messages are sent through svc-send-message.
drop policy if exists "svc_conversations_participant_rw" on public.svc_conversations;
drop policy if exists "svc_conversations_participant_select" on public.svc_conversations;
drop policy if exists "svc_conversations_support_insert" on public.svc_conversations;

create policy "svc_conversations_participant_select"
on public.svc_conversations
for select
to authenticated
using (
  client_user_id = (select auth.uid())
  or provider_user_id = (select auth.uid())
  or public.is_admin_user((select auth.uid()))
);

create policy "svc_conversations_support_insert"
on public.svc_conversations
for insert
to authenticated
with check (
  client_user_id = (select auth.uid())
  and provider_user_id is null
  and app_context = 'support'
  and status in ('OPEN', 'open')
  and (
    (
      participant_role = 'client'
      and metadata_json ->> 'support_type' = 'client_admin'
    )
    or (
      participant_role = 'provider'
      and metadata_json ->> 'support_type' = 'provider_admin'
      and (metadata_json ->> 'provider_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and exists (
        select 1
        from public.svc_providers p
        where p.user_id = (select auth.uid())
          and p.id = (metadata_json ->> 'provider_id')::uuid
      )
    )
  )
);

drop policy if exists "svc_messages_participant_rw" on public.svc_messages;
drop policy if exists "svc_messages_participant_select" on public.svc_messages;
create policy "svc_messages_participant_select"
on public.svc_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.svc_conversations c
    where c.id = svc_messages.conversation_id
      and (
        c.client_user_id = (select auth.uid())
        or c.provider_user_id = (select auth.uid())
        or public.is_admin_user((select auth.uid()))
      )
  )
);

-- Reviews: providers can read their reviews, but cannot mutate/delete them.
drop policy if exists "svc_reviews_participant_rw" on public.svc_reviews;
drop policy if exists "svc_reviews_participant_select" on public.svc_reviews;
drop policy if exists "svc_reviews_client_insert" on public.svc_reviews;
drop policy if exists "svc_reviews_admin_delete" on public.svc_reviews;

create policy "svc_reviews_participant_select"
on public.svc_reviews
for select
to authenticated
using (
  client_user_id = (select auth.uid())
  or provider_id = public.svc_get_provider_id_by_user((select auth.uid()))
  or public.is_admin_user((select auth.uid()))
);

create policy "svc_reviews_client_insert"
on public.svc_reviews
for insert
to authenticated
with check (
  client_user_id = (select auth.uid())
  and exists (
    select 1
    from public.svc_requests r
    where r.id = svc_reviews.request_id
      and r.client_user_id = (select auth.uid())
      and (
        r.accepted_provider_id = svc_reviews.provider_id
        or r.selected_provider_id = svc_reviews.provider_id
      )
      and upper(coalesce(r.status, '')) = 'COMPLETED'
  )
);

create policy "svc_reviews_admin_delete"
on public.svc_reviews
for delete
to authenticated
using (public.is_admin_user((select auth.uid())));

-- SECURITY DEFINER functions used by Servicios/finance must pin pg_temp last.
alter function public.financial_admin_role(uuid) set search_path = public, pg_temp;
alter function public.financial_create_payout_batch(uuid, uuid, text) set search_path = public, pg_temp;
alter function public.financial_ensure_provider_wallet(uuid, public.financial_environment, boolean, uuid, public.financial_fiscal_visibility) set search_path = public, pg_temp;
alter function public.financial_mark_payout_paid(uuid, uuid, text) set search_path = public, pg_temp;
alter function public.financial_provider_payout_account_guard(uuid) set search_path = public, pg_temp;
alter function public.financial_rebuild_provider_wallet(uuid) set search_path = public, pg_temp;
alter function public.financial_recompute_provider_wallet_after_payout() set search_path = public, pg_temp;
alter function public.financial_recompute_provider_wallet_foundation(uuid, public.financial_environment, boolean) set search_path = public, pg_temp;
alter function public.financial_approve_settlement_batch(uuid, uuid) set search_path = public, pg_temp;
alter function public.financial_assert_transaction_balanced(uuid) set search_path = public, pg_temp;
alter function public.financial_block_immutable_mutation() set search_path = public, pg_temp;
alter function public.financial_calculate_settlement_batch(timestamp with time zone, timestamp with time zone, text, uuid, boolean, text) set search_path = public, pg_temp;
alter function public.financial_close_accounting_period(text, date, date, uuid, boolean) set search_path = public, pg_temp;
alter function public.financial_create_export_record(text, text, timestamp with time zone, timestamp with time zone, uuid, boolean) set search_path = public, pg_temp;
alter function public.financial_detect_refund_integrity_issues(uuid, numeric) set search_path = public, pg_temp;
alter function public.financial_get_provider_debt_limit(uuid) set search_path = public, pg_temp;
alter function public.financial_post_transaction(text, text, text, text, text, text, jsonb, jsonb) set search_path = public, pg_temp;
alter function public.financial_prevent_closed_period_posting() set search_path = public, pg_temp;
alter function public.financial_preview_debt_recovery(uuid, numeric, uuid, boolean, public.financial_environment, boolean) set search_path = public, pg_temp;
alter function public.financial_record_cash_manual_foundation_event(uuid, uuid, numeric, numeric, text, public.financial_environment, boolean, uuid, jsonb) set search_path = public, pg_temp;
alter function public.financial_run_reconciliation(timestamp with time zone, timestamp with time zone, text, uuid, boolean, text) set search_path = public, pg_temp;
alter function public.financial_set_updated_at() set search_path = public, pg_temp;
alter function public.is_finance_admin(uuid) set search_path = public, pg_temp;
alter function public.is_financial_auditor(uuid) set search_path = public, pg_temp;

commit;
