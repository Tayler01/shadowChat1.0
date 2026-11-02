-- Schema-only native SQL fixture; no project rows/secrets. Real native functions
-- are imported by the runner from canonical migrations; unrelated feature FKs,
-- triggers and policies are intentionally excluded from this isolated domain.
create schema if not exists private;
create schema if not exists auth;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create table auth.users(id uuid primary key,banned_until timestamptz,deleted_at timestamptz);
create table public.users(id uuid primary key,username text,display_name text);
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;

--
-- PostgreSQL database dump
--

\restrict CTzC1yQN5k4TdesxALtMeKYjfafUlM3RotW8SuqfsPjrtvqYYh6bj5euwVDq8yt

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: notification_v2_runtime_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_v2_runtime_config (
    singleton boolean DEFAULT true NOT NULL,
    delivery_mode text DEFAULT 'disabled'::text NOT NULL,
    activation_watermark timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    enabled_categories text[] DEFAULT '{}'::text[] NOT NULL,
    canary_user_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    all_users_enabled boolean DEFAULT false NOT NULL,
    worker_invocation_enabled boolean DEFAULT false NOT NULL,
    worker_url text,
    last_delivery_request_at timestamp with time zone,
    last_delivery_request_id bigint,
    last_receipt_request_at timestamp with time zone,
    last_receipt_request_id bigint,
    last_worker_error text,
    receipt_reconciliation_enabled boolean DEFAULT false NOT NULL,
    worker_probe_url text,
    last_worker_response_at timestamp with time zone,
    last_worker_status_code integer,
    last_worker_success_at timestamp with time zone,
    last_worker_health_url text,
    CONSTRAINT notification_v2_runtime_canary_users_check CHECK ((array_position(canary_user_ids, NULL::uuid) IS NULL)),
    CONSTRAINT notification_v2_runtime_categories_check CHECK ((enabled_categories <@ ARRAY['dm'::text, 'general_chat'::text, 'mentions_replies'::text, 'reactions_hype'::text, 'shadow_pin'::text, 'connections'::text, 'presence'::text, 'shado_live'::text, 'shadow_checkers'::text, 'shadow_war'::text, 'weather'::text, 'security'::text, 'system'::text])),
    CONSTRAINT notification_v2_runtime_config_delivery_mode_check CHECK ((delivery_mode = ANY (ARRAY['disabled'::text, 'shadow'::text, 'active'::text]))),
    CONSTRAINT notification_v2_runtime_config_singleton_check CHECK (singleton),
    CONSTRAINT notification_v2_runtime_receipt_gate_check CHECK (((NOT receipt_reconciliation_enabled) OR (worker_url IS NOT NULL))),
    CONSTRAINT notification_v2_runtime_worker_error_check CHECK (((last_worker_error IS NULL) OR (char_length(last_worker_error) <= 500))),
    CONSTRAINT notification_v2_runtime_worker_gate_check CHECK (((NOT worker_invocation_enabled) OR ((delivery_mode = 'active'::text) AND (worker_url IS NOT NULL) AND (cardinality(enabled_categories) > 0) AND (all_users_enabled OR (cardinality(canary_user_ids) > 0))))),
    CONSTRAINT notification_v2_runtime_worker_probe_url_check CHECK (((worker_probe_url IS NULL) OR (worker_probe_url = 'https://shsqqouecvdoifzufkqm.supabase.co/functions/v1/deliver-notifications-v2'::text))),
    CONSTRAINT notification_v2_runtime_worker_status_check CHECK (((last_worker_status_code IS NULL) OR ((last_worker_status_code >= 100) AND (last_worker_status_code <= 599)))),
    CONSTRAINT notification_v2_runtime_worker_url_check CHECK (((worker_url IS NULL) OR (worker_url = 'https://shsqqouecvdoifzufkqm.supabase.co/functions/v1/deliver-notifications-v2'::text)))
);


--
-- Name: notification_native_tokens; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.notification_native_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    installation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    environment text NOT NULL,
    token text NOT NULL,
    token_hash text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    provider_receipt_id text,
    next_receipt_check_at timestamp with time zone,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    disabled_at timestamp with time zone,
    disabled_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_native_tokens_disabled_reason_check CHECK (((disabled_reason IS NULL) OR (char_length(disabled_reason) <= 240))),
    CONSTRAINT notification_native_tokens_environment_check CHECK ((environment = ANY (ARRAY['development'::text, 'preview'::text, 'production'::text]))),
    CONSTRAINT notification_native_tokens_provider_check CHECK ((provider = ANY (ARRAY['expo'::text, 'apns'::text, 'fcm'::text]))),
    CONSTRAINT notification_native_tokens_provider_receipt_id_check CHECK (((provider_receipt_id IS NULL) OR (char_length(provider_receipt_id) <= 512))),
    CONSTRAINT notification_native_tokens_token_check CHECK (((char_length(token) >= 16) AND (char_length(token) <= 4096))),
    CONSTRAINT notification_native_tokens_token_hash_check CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: notification_delivery_targets_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_delivery_targets_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    outbox_id uuid NOT NULL,
    event_id uuid NOT NULL,
    installation_id uuid NOT NULL,
    transport text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    provider_message_id text,
    next_receipt_check_at timestamp with time zone,
    last_status_code integer,
    last_error text,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    receipt_attempt_count integer DEFAULT 0 NOT NULL,
    receipt_expires_at timestamp with time zone,
    CONSTRAINT notification_delivery_targets_v2_attempt_count_check CHECK ((attempt_count >= 0)),
    CONSTRAINT notification_delivery_targets_v2_last_error_check CHECK (((last_error IS NULL) OR (char_length(last_error) <= 500))),
    CONSTRAINT notification_delivery_targets_v2_provider_message_id_check CHECK (((provider_message_id IS NULL) OR (char_length(provider_message_id) <= 512))),
    CONSTRAINT notification_delivery_targets_v2_receipt_attempt_count_check CHECK (((receipt_attempt_count >= 0) AND (receipt_attempt_count <= 12))),
    CONSTRAINT notification_delivery_targets_v2_status_check CHECK ((status = ANY (ARRAY['shadow'::text, 'pending'::text, 'accepted'::text, 'delivered'::text, 'cancelled'::text, 'failed'::text, 'invalid'::text]))),
    CONSTRAINT notification_delivery_targets_v2_transport_check CHECK ((transport = ANY (ARRAY['web_push'::text, 'expo'::text, 'apns'::text, 'fcm'::text])))
);


--
-- Name: notification_envelopes_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_envelopes_v2 (
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    schema_version smallint DEFAULT 2 NOT NULL,
    category_key text NOT NULL,
    title text NOT NULL,
    body text,
    private_title text DEFAULT 'New ShadowChat notification'::text NOT NULL,
    private_body text DEFAULT 'Open ShadowChat to view it.'::text,
    actor_id uuid,
    route text NOT NULL,
    group_key text NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    privacy_level text DEFAULT 'full'::text NOT NULL,
    action_keys text[] DEFAULT ARRAY['open'::text, 'mark_read'::text] NOT NULL,
    sound_id text NOT NULL,
    android_channel_key text NOT NULL,
    badge_category text DEFAULT 'none'::text NOT NULL,
    media_ref jsonb,
    created_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    compiled_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_envelopes_v2_action_keys_check CHECK ((action_keys <@ ARRAY['open'::text, 'mark_read'::text])),
    CONSTRAINT notification_envelopes_v2_action_keys_check1 CHECK ((cardinality(action_keys) <= 2)),
    CONSTRAINT notification_envelopes_v2_android_channel_key_check CHECK ((android_channel_key = ANY (ARRAY['messages_v1'::text, 'mentions_v1'::text, 'social_v1'::text, 'live_v1'::text, 'games_v1'::text, 'weather_v1'::text, 'security_v1'::text]))),
    CONSTRAINT notification_envelopes_v2_badge_category_check CHECK ((badge_category = ANY (ARRAY['dm'::text, 'group'::text, 'interactions'::text, 'connections'::text, 'shadow_pin'::text, 'games'::text, 'none'::text]))),
    CONSTRAINT notification_envelopes_v2_body_check CHECK (((body IS NULL) OR (char_length(body) <= 240))),
    CONSTRAINT notification_envelopes_v2_category_key_check CHECK ((category_key = ANY (ARRAY['dm'::text, 'general_chat'::text, 'mentions_replies'::text, 'reactions_hype'::text, 'shadow_pin'::text, 'connections'::text, 'presence'::text, 'shado_live'::text, 'shadow_checkers'::text, 'shadow_war'::text, 'weather'::text, 'security'::text, 'system'::text]))),
    CONSTRAINT notification_envelopes_v2_check CHECK ((expires_at >= created_at)),
    CONSTRAINT notification_envelopes_v2_group_key_check CHECK ((group_key ~ '^[a-z0-9_:-]{1,160}$'::text)),
    CONSTRAINT notification_envelopes_v2_media_ref_check CHECK (((media_ref IS NULL) OR ((jsonb_typeof(media_ref) = 'object'::text) AND (pg_column_size(media_ref) <= 2048)))),
    CONSTRAINT notification_envelopes_v2_priority_check CHECK ((priority = ANY (ARRAY['ambient'::text, 'normal'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT notification_envelopes_v2_privacy_level_check CHECK ((privacy_level = ANY (ARRAY['full'::text, 'sender_only'::text, 'private'::text]))),
    CONSTRAINT notification_envelopes_v2_private_body_check CHECK (((private_body IS NULL) OR (char_length(private_body) <= 160))),
    CONSTRAINT notification_envelopes_v2_private_title_check CHECK (((char_length(private_title) >= 1) AND (char_length(private_title) <= 120))),
    CONSTRAINT notification_envelopes_v2_route_check CHECK ((("left"(route, 1) = '/'::text) AND ("left"(route, 2) <> '//'::text) AND (char_length(route) <= 1024))),
    CONSTRAINT notification_envelopes_v2_schema_version_check CHECK ((schema_version = 2)),
    CONSTRAINT notification_envelopes_v2_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 120)))
);


--
-- Name: notification_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    entity_id uuid NOT NULL,
    conversation_id uuid,
    message_id uuid,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    dedupe_key text NOT NULL,
    sent_at timestamp with time zone,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    dm_message_id uuid,
    category text DEFAULT 'system'::text NOT NULL,
    actor_id uuid,
    route text,
    presentation_expires_at timestamp with time zone DEFAULT (now() + '00:01:30'::interval) NOT NULL,
    presented_at timestamp with time zone,
    resolved_at timestamp with time zone,
    CONSTRAINT notification_events_category_check CHECK ((category = ANY (ARRAY['dm'::text, 'group'::text, 'interactions'::text, 'connections'::text, 'shadow_pin'::text, 'presence'::text, 'live'::text, 'games'::text, 'system'::text]))),
    CONSTRAINT notification_events_presentation_window_check CHECK ((presentation_expires_at >= created_at)),
    CONSTRAINT notification_events_route_length_check CHECK (((route IS NULL) OR ((char_length(route) >= 1) AND (char_length(route) <= 2048))))
);


--
-- Name: notification_installations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_installations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    installation_key uuid NOT NULL,
    platform text NOT NULL,
    app_id text NOT NULL,
    project_id text,
    environment text DEFAULT 'production'::text NOT NULL,
    app_version text,
    build_number text,
    locale text,
    time_zone text,
    channel_schema_version integer DEFAULT 1 NOT NULL,
    foreground_until timestamp with time zone,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_installations_app_id_check CHECK (((char_length(app_id) >= 1) AND (char_length(app_id) <= 160))),
    CONSTRAINT notification_installations_app_version_check CHECK (((app_version IS NULL) OR (char_length(app_version) <= 40))),
    CONSTRAINT notification_installations_build_number_check CHECK (((build_number IS NULL) OR (char_length(build_number) <= 40))),
    CONSTRAINT notification_installations_channel_schema_version_check CHECK ((channel_schema_version >= 1)),
    CONSTRAINT notification_installations_environment_check CHECK ((environment = ANY (ARRAY['development'::text, 'preview'::text, 'production'::text]))),
    CONSTRAINT notification_installations_locale_check CHECK (((locale IS NULL) OR (char_length(locale) <= 40))),
    CONSTRAINT notification_installations_platform_check CHECK ((platform = ANY (ARRAY['web'::text, 'ios'::text, 'android'::text]))),
    CONSTRAINT notification_installations_project_id_check CHECK (((project_id IS NULL) OR ((char_length(project_id) >= 1) AND (char_length(project_id) <= 160)))),
    CONSTRAINT notification_installations_time_zone_check CHECK (((time_zone IS NULL) OR (char_length(time_zone) <= 80)))
);


--
-- Name: notification_outbox_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_outbox_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    delivery_mode text NOT NULL,
    status text NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    lease_token uuid,
    lease_expires_at timestamp with time zone,
    last_error text,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_outbox_v2_attempt_count_check CHECK ((attempt_count >= 0)),
    CONSTRAINT notification_outbox_v2_check CHECK ((((delivery_mode = 'shadow'::text) AND (status = 'shadow'::text)) OR (delivery_mode = 'active'::text))),
    CONSTRAINT notification_outbox_v2_check1 CHECK ((expires_at >= created_at)),
    CONSTRAINT notification_outbox_v2_delivery_mode_check CHECK ((delivery_mode = ANY (ARRAY['shadow'::text, 'active'::text]))),
    CONSTRAINT notification_outbox_v2_last_error_check CHECK (((last_error IS NULL) OR (char_length(last_error) <= 500))),
    CONSTRAINT notification_outbox_v2_max_attempts_check CHECK (((max_attempts >= 1) AND (max_attempts <= 10))),
    CONSTRAINT notification_outbox_v2_status_check CHECK ((status = ANY (ARRAY['shadow'::text, 'pending'::text, 'processing'::text, 'accepted'::text, 'delivered'::text, 'cancelled'::text, 'failed'::text])))
);


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    user_id uuid NOT NULL,
    dm_enabled boolean DEFAULT true NOT NULL,
    mention_enabled boolean DEFAULT true NOT NULL,
    reply_enabled boolean DEFAULT true NOT NULL,
    reaction_enabled boolean DEFAULT true NOT NULL,
    group_enabled boolean DEFAULT true NOT NULL,
    quiet_hours_start time without time zone,
    quiet_hours_end time without time zone,
    mute_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    hype_enabled boolean DEFAULT true NOT NULL,
    notifications_enabled boolean DEFAULT true NOT NULL,
    general_chat_muted boolean DEFAULT false NOT NULL,
    quiet_hours_timezone text DEFAULT 'UTC'::text NOT NULL,
    shadow_pin_new_post_enabled boolean DEFAULT true NOT NULL,
    shadow_pin_comment_enabled boolean DEFAULT true NOT NULL,
    shadow_pin_reply_enabled boolean DEFAULT true NOT NULL,
    connection_notifications_enabled boolean DEFAULT true NOT NULL,
    presence_in_app_enabled boolean DEFAULT true NOT NULL,
    presence_push_enabled boolean DEFAULT true NOT NULL,
    presence_notification_scope text DEFAULT 'connections'::text NOT NULL,
    badge_dm_enabled boolean DEFAULT true NOT NULL,
    badge_group_enabled boolean DEFAULT true NOT NULL,
    badge_interactions_enabled boolean DEFAULT true NOT NULL,
    badge_connections_enabled boolean DEFAULT true NOT NULL,
    badge_shadow_pin_enabled boolean DEFAULT true NOT NULL,
    shado_live_in_app_enabled boolean DEFAULT true NOT NULL,
    checkers_turn_enabled boolean DEFAULT true NOT NULL,
    badge_games_enabled boolean DEFAULT true NOT NULL,
    notification_preview_mode text DEFAULT 'full'::text NOT NULL,
    notification_media_enabled boolean DEFAULT true NOT NULL,
    notification_foreground_sounds_enabled boolean DEFAULT true NOT NULL,
    CONSTRAINT notification_preferences_presence_scope_check CHECK ((presence_notification_scope = ANY (ARRAY['connections'::text, 'all'::text]))),
    CONSTRAINT notification_preferences_preview_mode_check CHECK ((notification_preview_mode = ANY (ARRAY['full'::text, 'sender_only'::text, 'private'::text]))),
    CONSTRAINT notification_preferences_quiet_hours_pair_check CHECK ((((quiet_hours_start IS NULL) AND (quiet_hours_end IS NULL)) OR ((quiet_hours_start IS NOT NULL) AND (quiet_hours_end IS NOT NULL)))),
    CONSTRAINT notification_preferences_quiet_hours_range_check CHECK (((quiet_hours_start IS NULL) OR (quiet_hours_start <> quiet_hours_end))),
    CONSTRAINT notification_preferences_quiet_hours_timezone_check CHECK ((((length(quiet_hours_timezone) >= 1) AND (length(quiet_hours_timezone) <= 64)) AND (quiet_hours_timezone !~ '[[:cntrl:]]'::text)))
);


--
-- Name: notification_sound_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_sound_catalog (
    sound_id text NOT NULL,
    display_name text NOT NULL,
    native_file_name text,
    available boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_sound_catalog_display_name_check CHECK (((char_length(display_name) >= 1) AND (char_length(display_name) <= 80))),
    CONSTRAINT notification_sound_catalog_native_file_name_check CHECK (((native_file_name IS NULL) OR (native_file_name ~ '^[a-z0-9_]+\.wav$'::text))),
    CONSTRAINT notification_sound_catalog_sound_id_check CHECK ((sound_id ~ '^[a-z0-9_]{2,48}$'::text))
);


--
-- Name: notification_native_tokens notification_native_tokens_installation_id_provider_environ_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.notification_native_tokens
    ADD CONSTRAINT notification_native_tokens_installation_id_provider_environ_key UNIQUE (installation_id, provider, environment);


--
-- Name: notification_native_tokens notification_native_tokens_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.notification_native_tokens
    ADD CONSTRAINT notification_native_tokens_pkey PRIMARY KEY (id);


--
-- Name: notification_native_tokens notification_native_tokens_token_hash_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.notification_native_tokens
    ADD CONSTRAINT notification_native_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: notification_delivery_targets_v2 notification_delivery_targets_event_id_installation_id_tran_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_delivery_targets_v2
    ADD CONSTRAINT notification_delivery_targets_event_id_installation_id_tran_key UNIQUE (event_id, installation_id, transport);


--
-- Name: notification_delivery_targets_v2 notification_delivery_targets_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_delivery_targets_v2
    ADD CONSTRAINT notification_delivery_targets_v2_pkey PRIMARY KEY (id);


--
-- Name: notification_envelopes_v2 notification_envelopes_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_envelopes_v2
    ADD CONSTRAINT notification_envelopes_v2_pkey PRIMARY KEY (event_id);


--
-- Name: notification_events notification_events_dedupe_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_events
    ADD CONSTRAINT notification_events_dedupe_key_key UNIQUE (dedupe_key);


--
-- Name: notification_events notification_events_id_user_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_events
    ADD CONSTRAINT notification_events_id_user_unique UNIQUE (id, user_id);


--
-- Name: notification_events notification_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_events
    ADD CONSTRAINT notification_events_pkey PRIMARY KEY (id);


--
-- Name: notification_installations notification_installations_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_installations
    ADD CONSTRAINT notification_installations_id_user_id_key UNIQUE (id, user_id);


--
-- Name: notification_installations notification_installations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_installations
    ADD CONSTRAINT notification_installations_pkey PRIMARY KEY (id);


--
-- Name: notification_installations notification_installations_user_id_installation_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_installations
    ADD CONSTRAINT notification_installations_user_id_installation_key_key UNIQUE (user_id, installation_key);


--
-- Name: notification_outbox_v2 notification_outbox_v2_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_outbox_v2
    ADD CONSTRAINT notification_outbox_v2_event_id_key UNIQUE (event_id);


--
-- Name: notification_outbox_v2 notification_outbox_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_outbox_v2
    ADD CONSTRAINT notification_outbox_v2_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: notification_sound_catalog notification_sound_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_sound_catalog
    ADD CONSTRAINT notification_sound_catalog_pkey PRIMARY KEY (sound_id);


--
-- Name: notification_v2_runtime_config notification_v2_runtime_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_v2_runtime_config
    ADD CONSTRAINT notification_v2_runtime_config_pkey PRIMARY KEY (singleton);


--
-- Name: idx_notification_events_dm_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_events_dm_message_id ON public.notification_events USING btree (dm_message_id);


--
-- Name: idx_notification_events_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_events_user_created ON public.notification_events USING btree (user_id, created_at DESC);


--
-- Name: notification_envelopes_v2_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_envelopes_v2_group_idx ON public.notification_envelopes_v2 USING btree (user_id, group_key, created_at DESC);


--
-- Name: notification_envelopes_v2_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_envelopes_v2_user_created_idx ON public.notification_envelopes_v2 USING btree (user_id, created_at DESC, event_id DESC);


--
-- Name: notification_events_unread_connection_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_events_unread_connection_entity_idx ON public.notification_events USING btree (entity_id) WHERE ((read_at IS NULL) AND (type = ANY (ARRAY['connection_request'::text, 'connection_accepted'::text, 'connection_changed'::text])));


--
-- Name: notification_events_user_unpresented_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_events_user_unpresented_idx ON public.notification_events USING btree (user_id, presentation_expires_at, created_at DESC) WHERE ((presented_at IS NULL) AND (read_at IS NULL) AND (resolved_at IS NULL));


--
-- Name: notification_events_user_unread_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_events_user_unread_category_idx ON public.notification_events USING btree (user_id, category, created_at DESC, id DESC) WHERE ((read_at IS NULL) AND (resolved_at IS NULL));


--
-- Name: notification_installations_user_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_installations_user_active_idx ON public.notification_installations USING btree (user_id, last_seen_at DESC) WHERE (revoked_at IS NULL);


--
-- Name: notification_outbox_v2_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_outbox_v2_pending_idx ON public.notification_outbox_v2 USING btree (available_at, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));


--
-- Name: notification_outbox_v2 guard_notification_outbox_v2_insert; Type: TRIGGER; Schema: public; Owner: -
--




--
-- Name: notification_events materialize_notification_envelope_v2_insert; Type: TRIGGER; Schema: public; Owner: -
--




--
-- Name: notification_events mirror_shadow_pin_activity_event; Type: TRIGGER; Schema: public; Owner: -
--




--
-- Name: notification_events normalize_notification_event_insert; Type: TRIGGER; Schema: public; Owner: -
--




--
-- Name: notification_events normalize_notification_event_update; Type: TRIGGER; Schema: public; Owner: -
--




--
-- Name: notification_outbox_v2 request_notification_delivery_v2_after_insert; Type: TRIGGER; Schema: public; Owner: -
--




--
-- Name: notification_events sync_notification_delivery_job_insert; Type: TRIGGER; Schema: public; Owner: -
--




--
-- Name: notification_events sync_notification_delivery_job_update; Type: TRIGGER; Schema: public; Owner: -
--




--
-- Name: notification_events sync_shado_live_source_read; Type: TRIGGER; Schema: public; Owner: -
--




--
-- Name: notification_preferences update_notification_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--




--
-- Name: notification_native_tokens notification_native_tokens_installation_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--




--
-- Name: notification_native_tokens notification_native_tokens_installation_id_user_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--




--
-- Name: notification_native_tokens notification_native_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--




--
-- Name: notification_delivery_targets_v2 notification_delivery_targets_v2_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--




--
-- Name: notification_delivery_targets_v2 notification_delivery_targets_v2_installation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--




--
-- Name: notification_delivery_targets_v2 notification_delivery_targets_v2_outbox_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--




--
-- Name: notification_envelopes_v2 notification_envelopes_v2_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--




--
-- Name: notification_envelopes_v2 notification_envelopes_v2_event_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--




--
-- Name: notification_envelopes_v2 notification_envelopes_v2_sound_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--




--
-- Name: notification_events notification_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--




--
-- Name: notification_events notification_events_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--




--
-- Name: notification_events notification_events_dm_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--




--
-- Name: notification_events notification_events_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--




--
-- Name: notification_events notification_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--




--
-- Name: notification_installations notification_installations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--




--
-- Name: notification_outbox_v2 notification_outbox_v2_event_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--




--
-- Name: notification_preferences notification_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--




--
-- Name: notification_sound_catalog Authenticated users can read notification sounds; Type: POLICY; Schema: public; Owner: -
--




--
-- Name: notification_preferences Users can insert their own notification preferences; Type: POLICY; Schema: public; Owner: -
--




--
-- Name: notification_envelopes_v2 Users can read their notification envelopes; Type: POLICY; Schema: public; Owner: -
--




--
-- Name: notification_installations Users can read their notification installations; Type: POLICY; Schema: public; Owner: -
--




--
-- Name: notification_events Users can update their own notification events; Type: POLICY; Schema: public; Owner: -
--




--
-- Name: notification_preferences Users can update their own notification preferences; Type: POLICY; Schema: public; Owner: -
--




--
-- Name: notification_events Users can view their own notification events; Type: POLICY; Schema: public; Owner: -
--




--
-- Name: notification_preferences Users can view their own notification preferences; Type: POLICY; Schema: public; Owner: -
--




--
-- Name: notification_delivery_targets_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_delivery_targets_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_envelopes_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_envelopes_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_installations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_installations ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_outbox_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_outbox_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_sound_catalog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_sound_catalog ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_v2_runtime_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_v2_runtime_config ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict CTzC1yQN5k4TdesxALtMeKYjfafUlM3RotW8SuqfsPjrtvqYYh6bj5euwVDq8yt



create table private.account_deletion_jobs(user_id uuid primary key);
create function public.is_active_member_for_service(target_user_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$select target_user_id is not null
 and exists(select 1 from public.users u where u.id=target_user_id)
 and not exists(select 1 from private.account_deletion_jobs d where d.user_id=target_user_id)$$;
alter table public.notification_installations add column if not exists community_scope_version smallint;
create table private.notification_installation_credentials(installation_id uuid primary key,user_id uuid not null,
 credential_hash text not null,revoked_at timestamptz);
create table private.notification_native_worker_lease_v2(singleton boolean primary key default true,
 lease_token uuid,lease_expires_at timestamptz,invocation_reserved_until timestamptz,
 wake_continuations_remaining smallint not null default 0);
insert into private.notification_native_worker_lease_v2(singleton)values(true);
create schema vault;
create table vault.decrypted_secrets(name text,decrypted_secret text,updated_at timestamptz default now());
insert into vault.decrypted_secrets(name,decrypted_secret)values('shadowchat_notification_v2_worker_secret',repeat('fixture-only-',4));
create schema net;
create table private.qa_native_http_calls(id bigserial primary key,task text,queued_at timestamptz default clock_timestamp());
create function net.http_post(url text,body jsonb default '{}'::jsonb,params jsonb default '{}'::jsonb,
 headers jsonb default '{}'::jsonb,timeout_milliseconds integer default 9000)returns bigint language plpgsql as $$
declare r bigint;begin
 if url<>'https://shsqqouecvdoifzufkqm.supabase.co/functions/v1/deliver-notifications-v2'
 or body->>'action'<>'bounded_canary' or body->>'task' not in('deliver','receipts')
 or timeout_milliseconds<>9000 then raise exception 'HTTP bound changed';end if;
 insert into private.qa_native_http_calls(task)values(body->>'task')returning id into r;return r;end$$;
create schema cron;
create table cron.job(jobid bigserial primary key,jobname text,active boolean not null default false,schedule text,command text);
insert into cron.job(jobname,active,schedule,command)values('shadowchat-native-push-canary',false,'* * * * *','select private.request_bounded_native_notification_canary()');
insert into public.notification_v2_runtime_config(singleton)values(true);
insert into public.notification_sound_catalog(sound_id,display_name)values('shadow_whisper','Synthetic'),('low_glass','Synthetic'),('system_default','Synthetic');

create or replace function private.notification_v2_category(target_type text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when target_type = 'dm_message' then 'dm'
    when target_type = 'group_message' then 'general_chat'
    when target_type in ('mention', 'reply') then 'mentions_replies'
    when target_type in ('reaction', 'hype_event') then 'reactions_hype'
    when target_type in ('shadow_pin_post', 'shadow_pin_comment', 'shadow_pin_reply') then 'shadow_pin'
    when target_type in ('connection_request', 'connection_accepted') then 'connections'
    when target_type = 'presence_active' then 'presence'
    when target_type like 'shado_live_%' then 'shado_live'
    when target_type = 'shadow_checkers_turn' then 'shadow_checkers'
    when target_type = 'shadow_war_turn' then 'shadow_war'
    when target_type = 'weather_alert' then 'weather'
    when target_type = 'security_alert' then 'security'
    else 'system'
  end
$$;
create or replace function private.notification_v2_sound(target_type text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when target_type = 'dm_message' then 'shadow_whisper'
    when target_type = 'group_message' then 'low_glass'
    when target_type in ('mention', 'reply') then 'gold_signal'
    when target_type in ('reaction', 'hype_event') then 'hype_burst'
    when target_type in ('shadow_pin_post', 'shadow_pin_comment') then 'pin_shutter'
    when target_type = 'shadow_pin_reply' then 'gold_signal'
    when target_type in ('connection_request', 'connection_accepted') then 'connection_chime'
    when target_type = 'presence_active' then 'presence_pulse'
    when target_type like 'shado_live_%' then 'live_beacon'
    when target_type = 'shadow_checkers_turn' then 'checkers_move'
    when target_type = 'shadow_war_turn' then 'war_drum'
    when target_type = 'weather_alert' then 'weather_glass'
    when target_type = 'security_alert' then 'security_signal'
    else 'system_default'
  end
$$;
create or replace function private.notification_v2_channel(target_type text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when target_type in ('dm_message', 'group_message') then 'messages_v1'
    when target_type in ('mention', 'reply') then 'mentions_v1'
    when target_type like 'shado_live_%' then 'live_v1'
    when target_type in ('shadow_checkers_turn', 'shadow_war_turn') then 'games_v1'
    when target_type = 'weather_alert' then 'weather_v1'
    when target_type = 'security_alert' then 'security_v1'
    else 'social_v1'
  end
$$;
create or replace function private.notification_v2_badge_category(target_type text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when target_type = 'dm_message' then 'dm'
    when target_type = 'group_message' then 'group'
    when target_type in ('mention', 'reply', 'reaction', 'hype_event', 'security_alert') then 'interactions'
    when target_type in ('connection_request', 'connection_accepted') then 'connections'
    when target_type in ('shadow_pin_post', 'shadow_pin_comment', 'shadow_pin_reply') then 'shadow_pin'
    when target_type like 'shado_live_%'
      or target_type in ('shadow_checkers_turn', 'shadow_war_turn') then 'games'
    else 'none'
  end
$$;
create or replace function private.notification_v2_group_key(
  target_type text,
  target_entity_id uuid,
  target_actor_id uuid,
  target_conversation_id uuid,
  target_message_id uuid,
  target_payload jsonb
)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when target_type = 'dm_message'
      then 'dm:' || coalesce(target_conversation_id, target_entity_id)::text
    when target_type = 'group_message'
      then 'group:' || coalesce(nullif(target_payload ->> 'thread_id', ''), target_message_id::text, 'general')
    when target_type in ('reaction', 'hype_event')
      then 'message:' || coalesce(target_message_id, target_entity_id)::text || ':reactions'
    when target_type in ('shadow_pin_comment', 'shadow_pin_reply')
      then 'pin:' || coalesce(nullif(target_payload ->> 'image_id', ''), target_entity_id::text) || ':conversation'
    when target_type = 'shadow_pin_post'
      then 'pin:' || target_entity_id::text
    when target_type in ('connection_request', 'connection_accepted')
      then 'connection:' || coalesce(target_actor_id, target_entity_id)::text
    when target_type = 'presence_active'
      then 'presence:' || coalesce(target_actor_id, target_entity_id)::text
    when target_type like 'shado_live_%'
      then 'live:' || coalesce(nullif(target_payload ->> 'room_id', ''), target_entity_id::text)
    when target_type = 'shadow_checkers_turn'
      then 'checkers:' || target_entity_id::text
    when target_type = 'shadow_war_turn'
      then 'shadow-war:' || target_entity_id::text
    when target_type = 'weather_alert'
      then 'weather:' || target_entity_id::text
    when target_type = 'security_alert'
      then 'security:' || target_entity_id::text
    else 'system:' || target_entity_id::text
  end
$$;
create or replace function private.notification_v2_safe_route(target_route text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when left(target_route, 1) = '/'
      and left(target_route, 2) <> '//'
      and char_length(target_route) <= 1024
      then target_route
    else '/?view=catchup'
  end
$$;
create or replace function private.request_native_notification_wake_v1(is_continuation boolean)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  runtime public.notification_v2_runtime_config;
  worker_secret text;
  action text;
  request_id bigint;
  worker_state private.notification_native_worker_lease_v2;
begin
  select * into runtime from public.notification_v2_runtime_config where singleton;
  if runtime.singleton is not true or runtime.delivery_mode <> 'active' or not runtime.worker_invocation_enabled
    or runtime.all_users_enabled or cardinality(runtime.canary_user_ids) not between 1 and 10
    or cardinality(runtime.enabled_categories) = 0
    or runtime.worker_url is distinct from
      'https://shsqqouecvdoifzufkqm.supabase.co/functions/v1/deliver-notifications-v2' then
    return null;
  end if;
  -- Alternate only when receipts are actually due; delivery has priority.
  if exists (
    select 1 from public.notification_outbox_v2 outbox
    join public.notification_envelopes_v2 envelope on envelope.event_id = outbox.event_id
    join public.notification_events event on event.id = outbox.event_id
    where outbox.user_id = any(runtime.canary_user_ids)
      and outbox.created_at >= runtime.activation_watermark
      and outbox.delivery_mode = 'active' and outbox.status in ('pending', 'processing')
      and outbox.attempt_count < 3 and outbox.available_at <= now() and outbox.expires_at > now()
      and (outbox.status = 'pending' or outbox.lease_expires_at <= now())
      and envelope.category_key = any(runtime.enabled_categories)
      and event.read_at is null and event.resolved_at is null
  ) then action := 'deliver';
  elsif runtime.receipt_reconciliation_enabled and exists (
    select 1 from public.notification_delivery_targets_v2 target
    join public.notification_installations installation on installation.id = target.installation_id
    join public.notification_envelopes_v2 envelope on envelope.event_id = target.event_id
    where target.transport = 'expo' and target.status = 'accepted' and target.receipt_attempt_count < 3
      and target.created_at >= runtime.activation_watermark
      and installation.user_id = any(runtime.canary_user_ids)
      and envelope.category_key = any(runtime.enabled_categories)
      and (target.next_receipt_check_at <= now() or target.receipt_expires_at <= now())
  ) then action := 'receipts';
  else return null; end if;
  -- Never make a member INSERT wait on a worker holding this singleton.
  select * into worker_state from private.notification_native_worker_lease_v2
  where singleton for update skip locked;
  if not found then return null; end if;
  if not is_continuation then
    -- A new event/cron tick starts a fresh bounded burst, including when the
    -- previous worker is still running. No HTTP or lease stealing occurs here.
    update private.notification_native_worker_lease_v2
    set wake_continuations_remaining = 4 where singleton;
  elsif worker_state.wake_continuations_remaining <= 0 then return null;
  end if;
  if worker_state.invocation_reserved_until > now()
    or worker_state.lease_expires_at > now() then return null; end if;
  -- Reservation is crash recovery, not a successful-delivery cooldown.
  update private.notification_native_worker_lease_v2
  set invocation_reserved_until = now() + interval '30 seconds',
      wake_continuations_remaining = case when is_continuation
        then wake_continuations_remaining - 1 else 4 end
  where singleton;
  select decrypted_secret into worker_secret from vault.decrypted_secrets
  where name = 'shadowchat_notification_v2_worker_secret' order by updated_at desc limit 1;
  if worker_secret is null or length(worker_secret) < 32 then
    update private.notification_native_worker_lease_v2
    set invocation_reserved_until = null, wake_continuations_remaining = 0 where singleton;
    return null;
  end if;
  select net.http_post(url := runtime.worker_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-shadowchat-worker-secret', worker_secret),
    body := jsonb_build_object('action', 'bounded_canary', 'task', action),
    timeout_milliseconds := 9000) into request_id;
  return request_id;
end;
$$;
create or replace function private.request_bounded_native_notification_canary()
returns bigint language sql security definer set search_path = '' as $$
  select private.request_native_notification_wake_v1(false)
$$;
create or replace function private.wake_new_native_notification_outbox_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- A statement with no inserted eligible rows must not wake an old backlog.
  if exists (select 1 from inserted_notification_outbox
    where delivery_mode = 'active' and status = 'pending') then
    perform private.request_native_notification_wake_v1(false);
  end if;
  return null;
exception when others then
  -- Queuing is best effort. A worker/Vault/pg_net failure must not roll back
  -- chat or notification writes; the unchanged minute cron remains recovery.
  return null;
end;
$$;
create or replace function public.release_native_notification_worker_v2(target_lease_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  update private.notification_native_worker_lease_v2
  set lease_token = null, lease_expires_at = null, invocation_reserved_until = null
  where singleton and lease_token = target_lease_token;
  if not found then return false; end if;
  begin
    -- At most four successors per fresh event/tick. Each still enforces the
    -- original two-event/four-target/eight-second worker bounds and dedupe.
    perform private.request_native_notification_wake_v1(true);
  exception when others then
    -- Keep this owner's release even if continuation cannot be queued.
    null;
  end;
  return true;
end;
$$;
create or replace function public.complete_notification_outbox_v2(
  target_outbox_id uuid,
  target_lease_token uuid,
  target_status text,
  target_error text default null,
  retry_after_seconds integer default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if target_status not in (
    'pending',
    'accepted',
    'delivered',
    'cancelled',
    'failed'
  ) then
    raise exception 'Invalid completion status';
  end if;
  if retry_after_seconds is not null and retry_after_seconds not between 1 and 3600 then
    raise exception 'Invalid retry delay';
  end if;

  update public.notification_outbox_v2 outbox
  set
    status = target_status,
    available_at = case
      when target_status = 'pending'
        then now() + make_interval(secs => coalesce(retry_after_seconds, 15))
      else outbox.available_at
    end,
    lease_token = null,
    lease_expires_at = null,
    last_error = nullif(left(target_error, 500), ''),
    completed_at = case
      when target_status in ('pending', 'accepted') then null
      else now()
    end,
    updated_at = now()
  where outbox.id = target_outbox_id
    and outbox.lease_token = target_lease_token
    and outbox.status = 'processing';

  return found;
end;
$$;
create or replace function private.guard_notification_outbox_v2_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  runtime public.notification_v2_runtime_config;
  category_key text;
begin
  select * into runtime
  from public.notification_v2_runtime_config
  where singleton = true;

  if runtime.delivery_mode not in ('shadow', 'active')
    or new.delivery_mode <> runtime.delivery_mode
    or new.created_at < runtime.activation_watermark then
    return null;
  end if;

  select envelopes.category_key into category_key
  from public.notification_envelopes_v2 envelopes
  where envelopes.event_id = new.event_id
    and envelopes.user_id = new.user_id;

  if category_key is null
    or not (category_key = any(runtime.enabled_categories))
    or (
      not runtime.all_users_enabled
      and not (new.user_id = any(runtime.canary_user_ids))
    ) then
    return null;
  end if;
  return new;
end;
$$;