-- ============================================================================
-- Bays Ranch seed data
--
-- Everything below is computed relative to now() (in the farm's
-- America/Chicago timezone) rather than hard-coded dates, so `supabase db
-- reset` produces a dataset where "Today" / "This Month" dashboard filters
-- are always correct, no matter what day this is run.
--
-- Audio key -> log_id mapping (fixed UUIDs; audio_path = <farm_id>/<employee_id>/<log_id>.m4a)
--   spraying   -> 40000000-0000-0000-0000-000000000001  (Isaac Wang / FIELD A)
--   harvesting -> 40000000-0000-0000-0000-000000000002  (Maya Patel / FIELD B)
--   planting   -> 40000000-0000-0000-0000-000000000003  (Liam Johnson / FIELD C)
--   irrigating -> 40000000-0000-0000-0000-000000000004  (Sophia Lee / FIELD D)
-- (mirrored in supabase/seed-audio-map.json; a separate script fills in
-- waveform_peaks for these 4 from the real audio files.)
-- ============================================================================

-- Farm -----------------------------------------------------------------------
insert into public.farms (id, name, timezone) values
  ('30000000-0000-0000-0000-000000000001', 'Bays Ranch', 'America/Chicago');

-- Auth users -------------------------------------------------------------
-- instance_id/aud/role follow the local GoTrue defaults; password is the
-- same for every seeded account ("password123") purely for demo/grading
-- convenience, hashed with the same bcrypt path GoTrue itself uses.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@baysranch.test',  extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'isaac@baysranch.test',  extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'maya@baysranch.test',   extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'liam@baysranch.test',   extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sophia@baysranch.test', extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'noah@baysranch.test',   extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ava@baysranch.test',    extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ethan@baysranch.test',  extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'olivia@baysranch.test', extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mason@baysranch.test',  extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'emma@baysranch.test',   extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('10000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lucas@baysranch.test',  extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('10000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chloe@baysranch.test',  extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select
  u.id::text,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email',
  now(), now(), now()
from auth.users u
where u.id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000006',
  '10000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000008',
  '10000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-00000000000a',
  '10000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000c',
  '10000000-0000-0000-0000-00000000000d'
);

-- Profiles ---------------------------------------------------------------
insert into public.profiles (id, farm_id, full_name, email, role, is_active) values
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Bays Ranch',      'admin@baysranch.test',  'admin',  true),
  ('10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'Isaac Wang',      'isaac@baysranch.test',  'worker', true),
  ('10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'Maya Patel',      'maya@baysranch.test',   'worker', true),
  ('10000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', 'Liam Johnson',    'liam@baysranch.test',   'worker', true),
  ('10000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000001', 'Sophia Lee',      'sophia@baysranch.test', 'worker', true),
  ('10000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000001', 'Noah Garcia',     'noah@baysranch.test',   'worker', true),
  ('10000000-0000-0000-0000-000000000007', '30000000-0000-0000-0000-000000000001', 'Ava Thompson',    'ava@baysranch.test',    'worker', true),
  ('10000000-0000-0000-0000-000000000008', '30000000-0000-0000-0000-000000000001', 'Ethan Brooks',    'ethan@baysranch.test',  'worker', true),
  ('10000000-0000-0000-0000-000000000009', '30000000-0000-0000-0000-000000000001', 'Olivia Martinez', 'olivia@baysranch.test', 'worker', true),
  ('10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', 'Mason Carter',    'mason@baysranch.test',  'worker', true),
  ('10000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-000000000001', 'Emma Rodriguez',  'emma@baysranch.test',   'worker', true),
  ('10000000-0000-0000-0000-00000000000c', '30000000-0000-0000-0000-000000000001', 'Lucas Bennett',   'lucas@baysranch.test',  'worker', true),
  ('10000000-0000-0000-0000-00000000000d', '30000000-0000-0000-0000-000000000001', 'Chloe Nguyen',    'chloe@baysranch.test',  'worker', true);

-- Fields -----------------------------------------------------------------
-- Four adjacent ~77-acre rectangles (2x2 grid) in cropland near lat 44.02,
-- lng -93.30 (southern Minnesota). Ring points wind counter-clockwise, as
-- required for PostGIS `geography` polygons.
insert into public.fields (id, farm_id, name, crop, boundary) values
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'FIELD A', 'soybeans',
    extensions.ST_GeogFromText('SRID=4326;POLYGON((-93.3100 44.0200, -93.3030 44.0200, -93.3030 44.0250, -93.3100 44.0250, -93.3100 44.0200))')),
  ('20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'FIELD B', 'soybeans',
    extensions.ST_GeogFromText('SRID=4326;POLYGON((-93.3030 44.0200, -93.2960 44.0200, -93.2960 44.0250, -93.3030 44.0250, -93.3030 44.0200))')),
  ('20000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'FIELD C', 'corn',
    extensions.ST_GeogFromText('SRID=4326;POLYGON((-93.3100 44.0150, -93.3030 44.0150, -93.3030 44.0200, -93.3100 44.0200, -93.3100 44.0150))')),
  ('20000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', 'FIELD D', 'corn',
    extensions.ST_GeogFromText('SRID=4326;POLYGON((-93.3030 44.0150, -93.2960 44.0150, -93.2960 44.0200, -93.3030 44.0200, -93.3030 44.0150))'));

-- Tags -----------------------------------------------------------------------
insert into public.tags (id, farm_id, name, color) values
  ('60000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Needs Review',     '#F59E0B'),
  ('60000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'Chemical Applied', '#16A34A'),
  ('60000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'Follow Up',        '#3B82F6'),
  ('60000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', 'Verified',         '#6B7280');

-- ============================================================================
-- Logs: 4 headline (with audio) + 5 today (early-morning, no audio) +
-- 20 historical (previous 60 days, no audio), generated in one PL/pgSQL
-- block so day/time math stays relative to now() and the ~90% is_valid
-- ratio over the trailing 30 days can be hit exactly.
-- ============================================================================
do $$
declare
  v_farm_id uuid := '30000000-0000-0000-0000-000000000001';
  v_admin_id uuid := '10000000-0000-0000-0000-000000000001';
  v_tz text := 'America/Chicago';
  v_today_local date := (now() at time zone 'America/Chicago')::date;
  v_dom int := extract(day from v_today_local)::int;
  v_base_day date;
  v_day1 date; v_day2 date; v_day3 date; v_day4 date;

  v_worker_ids uuid[] := array[
    '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000007',
    '10000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000009',
    '10000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000b',
    '10000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-00000000000d'
  ];
  v_field_ids uuid[] := array[
    '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000004'
  ];
  v_field_names text[] := array['FIELD A', 'FIELD B', 'FIELD C', 'FIELD D'];
  v_field_lng numeric[] := array[-93.3065, -93.2995, -93.3065, -93.2995];
  v_field_lat numeric[] := array[44.0225, 44.0225, 44.0175, 44.0175];
  v_activities public.activity_type[] := array[
    'spraying', 'fertilizing', 'planting', 'irrigating', 'harvesting',
    'scouting', 'pruning', 'soil_work', 'equipment_maintenance'
  ]::public.activity_type[];
  v_activity_labels text[] := array[
    'Spraying', 'Fertilizing', 'Planting', 'Irrigating', 'Harvesting',
    'Scouting', 'Pruning', 'Soil work', 'Equipment maintenance'
  ];

  v_log_spray uuid := '40000000-0000-0000-0000-000000000001';
  v_log_harvest uuid := '40000000-0000-0000-0000-000000000002';
  v_log_plant uuid := '40000000-0000-0000-0000-000000000003';
  v_log_irrigate uuid := '40000000-0000-0000-0000-000000000004';
  v_log_today_unread uuid := '50000000-0000-0000-0000-000000000001';
  v_log_older_verified_1 uuid := '70000000-0000-0000-0000-000000000001';
  v_log_older_verified_2 uuid := '70000000-0000-0000-0000-000000000002';

  v_started timestamptz;
  v_ended timestamptz;
  v_summary text;
  v_activity_q text := 'What type of activity was this — spraying, fertilizing, planting, irrigating, harvesting, scouting, pruning, soil work, or equipment maintenance?';
  v_field_q text := 'Where were you working (field, block, or area)?';
  v_log_id uuid;
  v_worker uuid;
  v_field_idx int;
  v_activity_idx int;
  v_field_answer text;
  v_field_invalid boolean;
  i int;
begin
  -- Headline days: consecutive, always within the current month in farm
  -- time. If "today" is early in the month, use days 1-4 so the headline
  -- logs don't land in the future; otherwise use the 4 days before today.
  if v_dom < 5 then
    v_base_day := date_trunc('month', v_today_local)::date;
  else
    v_base_day := v_today_local - 4;
  end if;
  v_day1 := v_base_day;
  v_day2 := v_base_day + 1;
  v_day3 := v_base_day + 2;
  v_day4 := v_base_day + 3;

  -- ---- Headline log 1: Isaac Wang / spraying / FIELD A -------------------
  v_started := (v_day1 + time '06:00') at time zone v_tz;
  v_ended := (v_day1 + time '10:40') at time zone v_tz;
  v_summary := format(
    'Offline guided voice log created at %s. Question (activity_type): %s Answer: Spraying. Question (field_block): %s Answer: Field A.',
    to_char(v_started at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), v_activity_q, v_field_q
  );
  insert into public.logs (
    id, farm_id, employee_id, field_id, activity, started_at, ended_at,
    audio_path, audio_mime, source, transcript, summary, details, location
  ) values (
    v_log_spray, v_farm_id, v_worker_ids[1], v_field_ids[1], 'spraying', v_started, v_ended,
    v_farm_id::text || '/' || v_worker_ids[1]::text || '/' || v_log_spray::text || '.m4a',
    'audio/mp4', 'seed',
    'I was spraying post-emergence on the soybeans, Roundup PowerMax at 32 ounces an acre in 15 gallons of water. That was Field A, the whole thing, wind was light out of the south so no drift issues.',
    v_summary,
    '{"product":"Roundup PowerMAX","rate":"32 fl oz/ac","carrier":"15 gal/ac water"}'::jsonb,
    extensions.ST_MakePoint(v_field_lng[1], v_field_lat[1])::extensions.geography
  );
  insert into public.log_answers (log_id, "position", question_key, question, answer, is_valid) values
    (v_log_spray, 1, 'activity_type', v_activity_q, 'Spraying', true),
    (v_log_spray, 2, 'field_block', v_field_q, 'Field A', true),
    (v_log_spray, 3, 'product_rate', 'What product and rate did you use?', 'Roundup PowerMAX at 32 ounces an acre in 15 gallons of water', true);
  insert into public.log_tags (log_id, tag_id, created_by) values
    (v_log_spray, '60000000-0000-0000-0000-000000000002', v_admin_id);

  -- ---- Headline log 2: Maya Patel / harvesting / FIELD B ------------------
  v_started := (v_day2 + time '07:30') at time zone v_tz;
  v_ended := (v_day2 + time '11:15') at time zone v_tz;
  v_summary := format(
    'Offline guided voice log created at %s. Question (activity_type): %s Answer: Harvesting. Question (field_block): %s Answer: Field B.',
    to_char(v_started at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), v_activity_q, v_field_q
  );
  insert into public.logs (
    id, farm_id, employee_id, field_id, activity, started_at, ended_at,
    audio_path, audio_mime, source, transcript, summary, details, location
  ) values (
    v_log_harvest, v_farm_id, v_worker_ids[2], v_field_ids[2], 'harvesting', v_started, v_ended,
    v_farm_id::text || '/' || v_worker_ids[2]::text || '/' || v_log_harvest::text || '.m4a',
    'audio/mp4', 'seed',
    'Harvesting soybeans with the combine this morning. Field B, west half is done, beans were running about 13 percent moisture and yielding around 55 bushels.',
    v_summary,
    '{"moisture":"13%","yield":"55 bu/ac"}'::jsonb,
    extensions.ST_MakePoint(v_field_lng[2], v_field_lat[2])::extensions.geography
  );
  insert into public.log_answers (log_id, "position", question_key, question, answer, is_valid) values
    (v_log_harvest, 1, 'activity_type', v_activity_q, 'Harvesting', true),
    (v_log_harvest, 2, 'field_block', v_field_q, 'Field B', true),
    (v_log_harvest, 3, 'product_rate', 'Any yield or moisture readings?', '13 percent moisture, about 55 bushels an acre', true);

  -- ---- Headline log 3: Liam Johnson / planting / FIELD C ------------------
  v_started := (v_day3 + time '08:00') at time zone v_tz;
  v_ended := (v_day3 + time '12:00') at time zone v_tz;
  v_summary := format(
    'Offline guided voice log created at %s. Question (activity_type): %s Answer: Planting. Question (field_block): %s Answer: Field C.',
    to_char(v_started at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), v_activity_q, v_field_q
  );
  insert into public.logs (
    id, farm_id, employee_id, field_id, activity, started_at, ended_at,
    audio_path, audio_mime, source, transcript, summary, details, location
  ) values (
    v_log_plant, v_farm_id, v_worker_ids[3], v_field_ids[3], 'planting', v_started, v_ended,
    v_farm_id::text || '/' || v_worker_ids[3]::text || '/' || v_log_plant::text || '.m4a',
    'audio/mp4', 'seed',
    'Planting corn, 34,000 seeds an acre at about two inches deep. I was in Field C, got through the north side before the planter needed a refill.',
    v_summary,
    '{"seed_rate":"34000 seeds/ac","depth":"2 in"}'::jsonb,
    extensions.ST_MakePoint(v_field_lng[3], v_field_lat[3])::extensions.geography
  );
  insert into public.log_answers (log_id, "position", question_key, question, answer, is_valid) values
    (v_log_plant, 1, 'activity_type', v_activity_q, 'Planting', true),
    (v_log_plant, 2, 'field_block', v_field_q, 'Field C', true),
    (v_log_plant, 3, 'product_rate', 'What seed rate and depth?', '34,000 seeds an acre at about two inches deep', true);

  -- ---- Headline log 4: Sophia Lee / irrigating / FIELD D ------------------
  v_started := (v_day4 + time '06:30') at time zone v_tz;
  v_ended := (v_day4 + time '09:30') at time zone v_tz;
  v_summary := format(
    'Offline guided voice log created at %s. Question (activity_type): %s Answer: Irrigating. Question (field_block): %s Answer: Field D.',
    to_char(v_started at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), v_activity_q, v_field_q
  );
  insert into public.logs (
    id, farm_id, employee_id, field_id, activity, started_at, ended_at,
    audio_path, audio_mime, source, transcript, summary, details, location
  ) values (
    v_log_irrigate, v_farm_id, v_worker_ids[4], v_field_ids[4], 'irrigating', v_started, v_ended,
    v_farm_id::text || '/' || v_worker_ids[4]::text || '/' || v_log_irrigate::text || '.m4a',
    'audio/mp4', 'seed',
    'Ran the center pivot for irrigation, put down about three-quarters of an inch. That''s Field D, full circle, took most of the morning.',
    v_summary,
    '{"application":"0.75 in"}'::jsonb,
    extensions.ST_MakePoint(v_field_lng[4], v_field_lat[4])::extensions.geography
  );
  insert into public.log_answers (log_id, "position", question_key, question, answer, is_valid) values
    (v_log_irrigate, 1, 'activity_type', v_activity_q, 'Irrigating', true),
    (v_log_irrigate, 2, 'field_block', v_field_q, 'Field D', true),
    (v_log_irrigate, 3, 'product_rate', 'How much water went down?', 'About three-quarters of an inch, full circle', true);

  -- ---- 5 logs today, early morning, no audio -------------------------------
  -- All valid answers (clean, in-office-hours-adjacent guided entries) so
  -- the trailing-30-day accuracy math below stays exact.
  for i in 1..5 loop
    v_worker := v_worker_ids[((i - 1) % 12) + 1];
    v_field_idx := ((i + 1) % 4) + 1;
    v_activity_idx := ((i * 2) % 9) + 1;
    v_started := (v_today_local + (time '05:00' + (i * interval '20 minutes'))) at time zone v_tz;
    v_ended := v_started + interval '1 hour 15 minutes';
    v_log_id := case when i = 1 then v_log_today_unread else gen_random_uuid() end;
    v_summary := format(
      'Offline guided voice log created at %s. Question (activity_type): %s Answer: %s. Question (field_block): %s Answer: %s.',
      to_char(v_started at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      v_activity_q, v_activity_labels[v_activity_idx],
      v_field_q, initcap(v_field_names[v_field_idx])
    );
    insert into public.logs (
      id, farm_id, employee_id, field_id, activity, started_at, ended_at,
      source, transcript, summary, location
    ) values (
      v_log_id, v_farm_id, v_worker, v_field_ids[v_field_idx], v_activities[v_activity_idx], v_started, v_ended,
      'seed',
      format('%s in %s this morning.', v_activity_labels[v_activity_idx], initcap(v_field_names[v_field_idx])),
      v_summary,
      extensions.ST_MakePoint(
        v_field_lng[v_field_idx] + (random() - 0.5) * 0.002,
        v_field_lat[v_field_idx] + (random() - 0.5) * 0.0015
      )::extensions.geography
    );
    insert into public.log_answers (log_id, "position", question_key, question, answer, is_valid) values
      (v_log_id, 1, 'activity_type', v_activity_q, v_activity_labels[v_activity_idx], true),
      (v_log_id, 2, 'field_block', v_field_q, initcap(v_field_names[v_field_idx]), true);
  end loop;

  -- ---- 10 historical logs, 5-29 days ago (within the trailing 30 days) ----
  -- 4 of the 10 field_block answers are deliberately marked invalid/messy so
  -- that, combined with the all-valid headline + today answers above, the
  -- trailing-30-day accuracy lands at exactly 38/42 = 90.48% -> rounds to 90.
  for i in 1..10 loop
    v_worker := v_worker_ids[((i + 2) % 12) + 1];
    v_field_idx := (i % 4) + 1;
    v_activity_idx := ((i + 3) % 9) + 1;
    v_started := (v_today_local - (array[5,8,11,14,17,20,22,24,27,29])[i] + time '09:00' + (i * interval '13 minutes')) at time zone v_tz;
    v_ended := v_started + (interval '2 hours' + ((i % 4) * interval '35 minutes'));
    v_field_invalid := i in (2, 4, 6, 8);
    v_field_answer := case when v_field_invalid then 'uhm no, I don''t remember anything' else initcap(v_field_names[v_field_idx]) end;
    v_summary := format(
      'Offline guided voice log created at %s. Question (activity_type): %s Answer: %s. Question (field_block): %s Answer: %s.',
      to_char(v_started at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      v_activity_q, v_activity_labels[v_activity_idx],
      v_field_q, v_field_answer
    );
    insert into public.logs (
      farm_id, employee_id, field_id, activity, started_at, ended_at,
      source, transcript, summary, location
    ) values (
      v_farm_id, v_worker, v_field_ids[v_field_idx], v_activities[v_activity_idx], v_started, v_ended,
      'seed',
      format('%s in %s.', v_activity_labels[v_activity_idx], initcap(v_field_names[v_field_idx])),
      v_summary,
      extensions.ST_MakePoint(
        v_field_lng[v_field_idx] + (random() - 0.5) * 0.002,
        v_field_lat[v_field_idx] + (random() - 0.5) * 0.0015
      )::extensions.geography
    )
    returning id into v_log_id;
    insert into public.log_answers (log_id, "position", question_key, question, answer, is_valid) values
      (v_log_id, 1, 'activity_type', v_activity_q, v_activity_labels[v_activity_idx], true),
      (v_log_id, 2, 'field_block', v_field_q, v_field_answer, not v_field_invalid);
  end loop;

  -- ---- 10 historical logs, 31-58 days ago (outside the trailing 30 days) --
  -- Two get fixed ids so the "Verified" tag can be attached to them below.
  for i in 1..10 loop
    v_worker := v_worker_ids[((i + 6) % 12) + 1];
    v_field_idx := ((i + 2) % 4) + 1;
    v_activity_idx := ((i + 5) % 9) + 1;
    v_started := (v_today_local - (array[31,34,37,40,43,46,49,52,55,58])[i] + time '10:00' + (i * interval '9 minutes')) at time zone v_tz;
    v_ended := v_started + (interval '2 hours' + ((i % 3) * interval '40 minutes'));
    v_field_invalid := i in (3, 7);
    v_field_answer := case when v_field_invalid then 'uhm no, I don''t remember anything' else initcap(v_field_names[v_field_idx]) end;
    v_log_id := case
      when i = 1 then v_log_older_verified_1
      when i = 2 then v_log_older_verified_2
      else gen_random_uuid()
    end;
    v_summary := format(
      'Offline guided voice log created at %s. Question (activity_type): %s Answer: %s. Question (field_block): %s Answer: %s.',
      to_char(v_started at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      v_activity_q, v_activity_labels[v_activity_idx],
      v_field_q, v_field_answer
    );
    insert into public.logs (
      id, farm_id, employee_id, field_id, activity, started_at, ended_at,
      source, transcript, summary, location
    ) values (
      v_log_id, v_farm_id, v_worker, v_field_ids[v_field_idx], v_activities[v_activity_idx], v_started, v_ended,
      'seed',
      format('%s in %s.', v_activity_labels[v_activity_idx], initcap(v_field_names[v_field_idx])),
      v_summary,
      extensions.ST_MakePoint(
        v_field_lng[v_field_idx] + (random() - 0.5) * 0.002,
        v_field_lat[v_field_idx] + (random() - 0.5) * 0.0015
      )::extensions.geography
    );
    insert into public.log_answers (log_id, "position", question_key, question, answer, is_valid) values
      (v_log_id, 1, 'activity_type', v_activity_q, v_activity_labels[v_activity_idx], true),
      (v_log_id, 2, 'field_block', v_field_q, v_field_answer, not v_field_invalid);
  end loop;

  -- ---- Tags: "Verified" on a couple of older logs -------------------------
  insert into public.log_tags (log_id, tag_id, created_by) values
    (v_log_older_verified_1, '60000000-0000-0000-0000-000000000004', v_admin_id),
    (v_log_older_verified_2, '60000000-0000-0000-0000-000000000004', v_admin_id);

  -- ---- Read receipts: admin has read everything except the 4 headline ----
  -- logs and 1 of today's 5 logs (-> new_logs_total = 5, todays_new = 1).
  insert into public.log_reads (log_id, user_id)
  select l.id, v_admin_id
  from public.logs l
  where l.farm_id = v_farm_id
    and l.id not in (v_log_spray, v_log_harvest, v_log_plant, v_log_irrigate, v_log_today_unread);
end $$;
