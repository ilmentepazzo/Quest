


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."create_conversation_message_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  c record;
  recipient uuid;
  story_title text;
begin
  select * into c
  from public.conversations
  where id = new.conversation_id;

  if not found then
    return new;
  end if;

  if new.sender_id = c.player_id then
    recipient := c.master_id;
  elsif new.sender_id = c.master_id then
    recipient := c.player_id;
  else
    return new;
  end if;

  if recipient is null or recipient = new.sender_id then
    return new;
  end if;

  select title into story_title
  from public.stories
  where id = c.story_id;

  insert into public.notifications (
    user_id,
    message,
    type,
    story_id,
    conversation_id,
    page,
    read,
    created_at
  ) values (
    recipient,
    'Nuovo messaggio' || coalesce(' su “' || story_title || '”', ' in una conversazione Lorecast') || '.',
    'conversation_message',
    c.story_id,
    c.id,
    case when recipient = c.master_id then 'area-master' else 'profilo' end,
    false,
    new.created_at
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."create_conversation_message_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_master_on_booking"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_story_title text;
  v_master_id uuid;
begin
  select
    s.title,
    s.author_id
  into
    v_story_title,
    v_master_id
  from public.stories s
  where s.id = new.story_id;

  if new.master_id is null and v_master_id is not null then
    update public.bookings
    set master_id = v_master_id
    where id = new.id;
  end if;

  if coalesce(new.master_id, v_master_id) is not null then
    insert into public.notifications (
      user_id,
      message,
      type,
      read,
      story_id,
      booking_id,
      page
    )
    values (
      coalesce(new.master_id, v_master_id),
      'Nuova richiesta di prenotazione per "' || coalesce(v_story_title, new.story_title, 'una tua storia') || '"',
      'booking_request',
      false,
      new.story_id::text,
      new.id,
      'area-master'
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_master_on_booking"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_master_on_booking_cancelled"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_story_title text;
  v_master_id uuid;
begin
  if old.status is distinct from new.status and new.status in ('Annullata', 'cancelled') then
    select s.title, coalesce(new.master_id, s.author_id, s.owner_id)
    into v_story_title, v_master_id
    from public.stories s
    where s.id = new.story_id;

    if v_master_id is not null and v_master_id is distinct from new.user_id then
      insert into public.notifications (user_id, message, type, read, story_id, page)
      values (
        v_master_id,
        'Una richiesta di prenotazione per "' || coalesce(v_story_title, new.story_title, 'una tua storia') || '" è stata annullata dal giocatore.',
        'booking_cancelled',
        false,
        new.story_id::text,
        'area-master'
      );
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_master_on_booking_cancelled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_master_on_review"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_story_title text;
begin
  select title
  into v_story_title
  from public.stories
  where id = new.story_id;

  insert into public.notifications (
    user_id,
    message,
    type,
    read,
    story_id,
    page
  )
  values (
    new.master_id,
    'Nuova recensione per "' || coalesce(v_story_title, 'una tua storia') || '"',
    'review_received',
    false,
    new.story_id::text,
    'profilo'
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_master_on_review"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_booking_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_story_title text;
  v_status text;
  v_user_message text;
  v_user_type text;
  v_master_message text;
begin
  if coalesce(old.status, '') = coalesce(new.status, '') then
    return new;
  end if;

  v_status := lower(trim(coalesce(new.status, '')));

  if v_status not in ('accettata', 'accepted', 'rifiutata', 'rejected', 'annullata', 'cancelled', 'canceled') then
    return new;
  end if;

  select coalesce(s.title, new.story_title, 'una storia')
  into v_story_title
  from public.stories s
  where s.id = new.story_id;

  v_story_title := coalesce(v_story_title, new.story_title, 'una storia');

  if v_status in ('accettata', 'accepted') then
    v_user_message := 'La tua prenotazione per "' || v_story_title || '" è stata accettata.';
    v_user_type := 'success';
  elsif v_status in ('rifiutata', 'rejected') then
    v_user_message := 'La tua prenotazione per "' || v_story_title || '" è stata rifiutata.';
    v_user_type := 'error';
  elsif v_status in ('annullata', 'cancelled', 'canceled') then
    v_user_message := 'La tua prenotazione per "' || v_story_title || '" è stata annullata.';
    v_user_type := 'warning';
    v_master_message := 'La richiesta di prenotazione per "' || v_story_title || '" è stata annullata.';
  end if;

  if new.user_id is not null and v_user_message is not null then
    insert into public.notifications (
      user_id,
      message,
      type,
      read,
      story_id,
      booking_id,
      page
    )
    values (
      new.user_id,
      v_user_message,
      v_user_type,
      false,
      new.story_id::text,
      new.id,
      'profilo'
    );
  end if;

  if new.master_id is not null and v_master_message is not null then
    insert into public.notifications (
      user_id,
      message,
      type,
      read,
      story_id,
      booking_id,
      page
    )
    values (
      new.master_id,
      v_master_message,
      'warning',
      false,
      new.story_id::text,
      new.id,
      'area-master'
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_on_booking_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_player_on_booking_completed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_story_title text;
begin
  if lower(coalesce(old.status, '')) in ('completata', 'completa', 'completed', 'complete') then
    return new;
  end if;

  if lower(coalesce(new.status, '')) not in ('completata', 'completa', 'completed', 'complete') then
    return new;
  end if;

  select s.title
  into v_story_title
  from public.stories s
  where s.id = new.story_id;

  if not exists (
    select 1
    from public.notifications n
    where n.user_id = new.user_id
      and n.type = 'booking_completed'
      and n.booking_id = new.id
  ) then
    insert into public.notifications (
      user_id,
      message,
      type,
      read,
      story_id,
      booking_id,
      page
    )
    values (
      new.user_id,
      'La sessione per "' || coalesce(v_story_title, new.story_title, 'una storia') || '" è stata completata. Puoi lasciare una recensione.',
      'booking_completed',
      false,
      new.story_id::text,
      new.id,
      'profilo'
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_player_on_booking_completed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_story_inquiry_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  inquiry_row public.story_inquiries%rowtype;
  recipient uuid;
  story_title text;
  notification_message text;
  target_page text;
begin
  select *
  into inquiry_row
  from public.story_inquiries
  where id = new.inquiry_id;

  if not found then
    return new;
  end if;

  if new.sender_id = inquiry_row.sender_id then
    recipient := inquiry_row.recipient_id;
    target_page := 'area-master';
  else
    recipient := inquiry_row.sender_id;
    target_page := 'profilo';
  end if;

  if recipient is null or recipient = new.sender_id then
    return new;
  end if;

  select title
  into story_title
  from public.stories
  where id = inquiry_row.story_id;

  notification_message := 'Nuovo messaggio su "' || coalesce(story_title, 'Storia') || '".';

  insert into public.notifications (
    user_id,
    message,
    type,
    read,
    story_id,
    inquiry_id,
    page,
    created_at
  ) values (
    recipient,
    notification_message,
    'story_inquiry',
    false,
    inquiry_row.story_id,
    inquiry_row.id,
    target_page,
    now()
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_story_inquiry_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_user_on_booking_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_story_id uuid;
  v_story_title text;
  v_sender_name text;
  v_page text;
begin
  select
    b.story_id,
    coalesce(s.title, b.story_title, 'una sessione'),
    case when b.master_id = new.recipient_id then 'area-master' else 'profilo' end
  into
    v_story_id,
    v_story_title,
    v_page
  from public.bookings b
  left join public.stories s on s.id = b.story_id
  where b.id = new.booking_id;

  select coalesce(p.name, 'Utente Lorecast')
  into v_sender_name
  from public.profiles p
  where p.id = new.sender_id;

  insert into public.notifications (
    user_id,
    message,
    type,
    read,
    story_id,
    booking_id,
    page
  )
  values (
    new.recipient_id,
    'Nuovo messaggio da ' || coalesce(v_sender_name, 'Utente Lorecast') || ' per "' || coalesce(v_story_title, 'una sessione') || '"',
    'booking_message',
    false,
    v_story_id::text,
    new.booking_id,
    v_page
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_user_on_booking_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_conversation_after_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      updated_at = new.created_at,
      status = 'open'
  where id = new.conversation_id;

  return new;
end;
$$;


ALTER FUNCTION "public"."touch_conversation_after_message"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."booking_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "booking_messages_message_check" CHECK ((("char_length"(TRIM(BOTH FROM "message")) >= 1) AND ("char_length"(TRIM(BOTH FROM "message")) <= 1000)))
);


ALTER TABLE "public"."booking_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "story_id" "uuid",
    "user_id" "uuid",
    "group_name" "text",
    "booking_date" "date",
    "booking_time" "text",
    "players" "text",
    "message" "text",
    "status" "text" DEFAULT 'In attesa'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "duration_minutes" integer,
    "master_name" "text",
    "start_time" time without time zone,
    "end_time" time without time zone,
    "master_id" "uuid",
    "story_title" "text",
    "payment_status" "text" DEFAULT 'not_active'::"text" NOT NULL,
    "payment_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "payment_currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "payment_provider" "text",
    "payment_reference" "text",
    "paid_at" timestamp with time zone,
    CONSTRAINT "bookings_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['not_required'::"text", 'not_active'::"text", 'unpaid'::"text", 'pending'::"text", 'paid'::"text", 'refunded'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "conversation_messages_body_check" CHECK ((("length"(TRIM(BOTH FROM "body")) >= 1) AND ("length"(TRIM(BOTH FROM "body")) <= 1200)))
);


ALTER TABLE "public"."conversation_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "story_id" "uuid",
    "booking_id" "uuid",
    "public_session_id" "uuid",
    "player_id" "uuid" NOT NULL,
    "master_id" "uuid" NOT NULL,
    "type" "text" DEFAULT 'story'::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "last_message_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "conversations_participants_different" CHECK (("player_id" <> "master_id")),
    CONSTRAINT "conversations_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'archived'::"text", 'closed'::"text"]))),
    CONSTRAINT "conversations_type_check" CHECK (("type" = ANY (ARRAY['story'::"text", 'booking'::"text", 'public_session'::"text", 'purchase'::"text"])))
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."master_availability" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "master_id" "uuid",
    "story_id" "text",
    "weekday" integer NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "availability_date" "date",
    CONSTRAINT "master_availability_valid_time" CHECK (("end_time" > "start_time")),
    CONSTRAINT "master_availability_weekday_check" CHECK ((("weekday" >= 0) AND ("weekday" <= 6)))
);


ALTER TABLE "public"."master_availability" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "message" "text" NOT NULL,
    "type" "text" DEFAULT 'info'::"text",
    "read" boolean DEFAULT false,
    "story_id" "text",
    "page" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "booking_id" "uuid",
    "inquiry_id" "uuid",
    "conversation_id" "uuid"
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" DEFAULT 'stripe'::"text" NOT NULL,
    "provider_event_id" "text" NOT NULL,
    "event_type" "text" DEFAULT 'manual'::"text" NOT NULL,
    "target_type" "text",
    "booking_id" "uuid",
    "story_id" "uuid",
    "story_purchase_id" "uuid",
    "user_id" "uuid",
    "status" "text" DEFAULT 'received'::"text",
    "raw" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "livemode" boolean DEFAULT false,
    "public_session_id" "text",
    "participant_id" "text",
    "master_id" "uuid",
    "amount" numeric(10,2),
    "currency" "text" DEFAULT 'EUR'::"text",
    "checkout_session_id" "text",
    "payment_intent_id" "text",
    "connected_account_id" "text",
    "application_fee_amount" numeric(10,2),
    "payload" "jsonb" DEFAULT '{}'::"jsonb",
    "processed_at" timestamp with time zone
);


ALTER TABLE "public"."payment_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "name" "text",
    "email" "text",
    "avatar_url" "text",
    "language" "text" DEFAULT 'it'::"text",
    "is_master" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "stripe_connect_account_id" "text",
    "stripe_connect_status" "text" DEFAULT 'not_started'::"text",
    "stripe_charges_enabled" boolean DEFAULT false,
    "stripe_payouts_enabled" boolean DEFAULT false,
    "stripe_details_submitted" boolean DEFAULT false,
    "stripe_onboarding_updated_at" timestamp with time zone
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."public_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "story_id" "text" NOT NULL,
    "story_title" "text",
    "story_author_id" "uuid",
    "session_date" "date",
    "start_time" time without time zone,
    "end_time" time without time zone,
    "duration_minutes" integer,
    "min_players" integer DEFAULT 2,
    "max_players" integer DEFAULT 6,
    "current_players" integer DEFAULT 0,
    "created_group_size" integer DEFAULT 1,
    "status" "text" DEFAULT 'open'::"text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "payment_status" "text" DEFAULT 'not_active'::"text",
    "payment_amount" numeric(10,2) DEFAULT 0,
    "payment_currency" "text" DEFAULT 'EUR'::"text"
);


ALTER TABLE "public"."public_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "story_id" "uuid" NOT NULL,
    "master_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "comment" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reviews_check" CHECK (("user_id" <> "master_id")),
    CONSTRAINT "reviews_comment_check" CHECK ((("char_length"(TRIM(BOTH FROM "comment")) >= 10) AND ("char_length"(TRIM(BOTH FROM "comment")) <= 600))),
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid",
    "story_id" "text" NOT NULL,
    "user_id" "uuid",
    "seats" integer DEFAULT 1,
    "status" "text" DEFAULT 'joined'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "payment_status" "text" DEFAULT 'not_active'::"text",
    "payment_amount" numeric(10,2) DEFAULT 0,
    "payment_currency" "text" DEFAULT 'EUR'::"text",
    "payment_provider" "text",
    "payment_reference" "text",
    "paid_at" timestamp with time zone
);


ALTER TABLE "public"."session_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid",
    "title" "text" NOT NULL,
    "genre" "text",
    "type" "text",
    "price" numeric DEFAULT 0,
    "is_free" boolean DEFAULT false,
    "duration" "text",
    "players" "text",
    "description" "text",
    "long_description" "text",
    "cover_url" "text",
    "trailer_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "author_id" "uuid",
    "duration_minutes" integer,
    "level" "text",
    "mode" "text",
    "master" "text",
    "materials" "jsonb" DEFAULT '[]'::"jsonb",
    "status" "text" DEFAULT 'published'::"text",
    "story_language" "text" DEFAULT 'it'::"text" NOT NULL,
    "experience_format" "text" DEFAULT 'one_shot_gdr'::"text" NOT NULL,
    CONSTRAINT "stories_experience_format_check" CHECK (("experience_format" = ANY (ARRAY['one_shot_gdr'::"text", 'campagna_gdr'::"text", 'board_game_session'::"text"])))
);


ALTER TABLE "public"."stories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."story_favorites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "story_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."story_favorites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."story_inquiries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "story_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "master_reply" "text",
    "replied_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "story_inquiries_check" CHECK (("sender_id" <> "recipient_id")),
    CONSTRAINT "story_inquiries_message_check" CHECK ((("char_length"(TRIM(BOTH FROM "message")) >= 10) AND ("char_length"(TRIM(BOTH FROM "message")) <= 1200))),
    CONSTRAINT "story_inquiries_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'read'::"text", 'replied'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."story_inquiries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."story_inquiry_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inquiry_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "story_inquiry_messages_body_check" CHECK ((("char_length"(TRIM(BOTH FROM "body")) >= 1) AND ("char_length"(TRIM(BOTH FROM "body")) <= 1200)))
);


ALTER TABLE "public"."story_inquiry_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."story_materials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "story_id" "uuid",
    "name" "text" NOT NULL,
    "type" "text",
    "visibility" "text",
    "notes" "text",
    "file_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."story_materials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."story_purchases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "story_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "payment_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "provider" "text",
    "provider_reference" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at" timestamp with time zone,
    "master_id" "uuid",
    "payment_amount" numeric(10,2) DEFAULT 0,
    "payment_currency" "text" DEFAULT 'EUR'::"text",
    "payment_provider" "text" DEFAULT 'stripe'::"text",
    "payment_reference" "text",
    CONSTRAINT "story_purchases_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['not_required'::"text", 'not_active'::"text", 'unpaid'::"text", 'pending'::"text", 'paid'::"text", 'refunded'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."story_purchases" OWNER TO "postgres";


ALTER TABLE ONLY "public"."booking_messages"
    ADD CONSTRAINT "booking_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_messages"
    ADD CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."master_availability"
    ADD CONSTRAINT "master_availability_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_events"
    ADD CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_events"
    ADD CONSTRAINT "payment_events_provider_event_unique" UNIQUE ("provider", "provider_event_id");



ALTER TABLE "public"."payment_events"
    ADD CONSTRAINT "payment_events_status_check" CHECK (("status" = ANY (ARRAY['received'::"text", 'processed'::"text", 'ignored'::"text", 'failed'::"text"]))) NOT VALID;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."profiles"
    ADD CONSTRAINT "profiles_stripe_connect_status_check" CHECK (("stripe_connect_status" = ANY (ARRAY['not_started'::"text", 'onboarding_started'::"text", 'pending'::"text", 'active'::"text", 'restricted'::"text", 'disabled'::"text"]))) NOT VALID;



ALTER TABLE "public"."public_sessions"
    ADD CONSTRAINT "public_sessions_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['not_required'::"text", 'not_active'::"text", 'unpaid'::"text", 'pending'::"text", 'paid'::"text", 'failed'::"text", 'refunded'::"text", 'cancelled'::"text"]))) NOT VALID;



ALTER TABLE ONLY "public"."public_sessions"
    ADD CONSTRAINT "public_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_booking_id_key" UNIQUE ("booking_id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."session_participants"
    ADD CONSTRAINT "session_participants_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['not_required'::"text", 'not_active'::"text", 'unpaid'::"text", 'pending'::"text", 'paid'::"text", 'failed'::"text", 'refunded'::"text", 'cancelled'::"text"]))) NOT VALID;



ALTER TABLE ONLY "public"."session_participants"
    ADD CONSTRAINT "session_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_participants"
    ADD CONSTRAINT "session_participants_session_id_user_id_key" UNIQUE ("session_id", "user_id");



ALTER TABLE ONLY "public"."stories"
    ADD CONSTRAINT "stories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."story_favorites"
    ADD CONSTRAINT "story_favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."story_inquiries"
    ADD CONSTRAINT "story_inquiries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."story_inquiry_messages"
    ADD CONSTRAINT "story_inquiry_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."story_materials"
    ADD CONSTRAINT "story_materials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."story_purchases"
    ADD CONSTRAINT "story_purchases_pkey" PRIMARY KEY ("id");



CREATE INDEX "booking_messages_booking_id_created_at_idx" ON "public"."booking_messages" USING "btree" ("booking_id", "created_at");



CREATE INDEX "booking_messages_recipient_id_created_at_idx" ON "public"."booking_messages" USING "btree" ("recipient_id", "created_at" DESC);



CREATE INDEX "bookings_payment_status_idx" ON "public"."bookings" USING "btree" ("payment_status");



CREATE INDEX "conversation_messages_conversation_idx" ON "public"."conversation_messages" USING "btree" ("conversation_id", "created_at");



CREATE INDEX "conversation_messages_sender_idx" ON "public"."conversation_messages" USING "btree" ("sender_id");



CREATE INDEX "conversations_master_idx" ON "public"."conversations" USING "btree" ("master_id", "updated_at" DESC);



CREATE INDEX "conversations_player_idx" ON "public"."conversations" USING "btree" ("player_id", "updated_at" DESC);



CREATE INDEX "conversations_story_idx" ON "public"."conversations" USING "btree" ("story_id");



CREATE UNIQUE INDEX "conversations_story_pair_unique" ON "public"."conversations" USING "btree" ("story_id", "player_id", "master_id", "type") WHERE (("booking_id" IS NULL) AND ("public_session_id" IS NULL));



CREATE INDEX "master_availability_story_date_idx" ON "public"."master_availability" USING "btree" ("story_id", "availability_date", "start_time");



CREATE INDEX "master_availability_story_id_idx" ON "public"."master_availability" USING "btree" ("story_id");



CREATE INDEX "notifications_booking_id_idx" ON "public"."notifications" USING "btree" ("booking_id");



CREATE INDEX "notifications_conversation_idx" ON "public"."notifications" USING "btree" ("conversation_id");



CREATE INDEX "notifications_user_inquiry_idx" ON "public"."notifications" USING "btree" ("user_id", "inquiry_id", "created_at" DESC);



CREATE INDEX "payment_events_booking_id_idx" ON "public"."payment_events" USING "btree" ("booking_id");



CREATE INDEX "payment_events_event_type_idx" ON "public"."payment_events" USING "btree" ("event_type");



CREATE UNIQUE INDEX "payment_events_provider_event_id_unique_idx" ON "public"."payment_events" USING "btree" ("provider", "provider_event_id") WHERE ("provider_event_id" IS NOT NULL);



CREATE INDEX "payment_events_public_session_id_idx" ON "public"."payment_events" USING "btree" ("public_session_id");



CREATE INDEX "payment_events_story_id_idx" ON "public"."payment_events" USING "btree" ("story_id");



CREATE INDEX "payment_events_story_purchase_id_idx" ON "public"."payment_events" USING "btree" ("story_purchase_id");



CREATE INDEX "payment_events_user_id_idx" ON "public"."payment_events" USING "btree" ("user_id");



CREATE INDEX "profiles_stripe_connect_status_idx" ON "public"."profiles" USING "btree" ("stripe_connect_status");



CREATE UNIQUE INDEX "profiles_unique_public_name_ci" ON "public"."profiles" USING "btree" ("lower"("name")) WHERE (("name" IS NOT NULL) AND (TRIM(BOTH FROM "name") <> ''::"text") AND (POSITION(('@'::"text") IN ("name")) = 0));



CREATE INDEX "public_sessions_payment_status_idx" ON "public"."public_sessions" USING "btree" ("payment_status");



CREATE INDEX "public_sessions_story_date_idx" ON "public"."public_sessions" USING "btree" ("story_id", "session_date", "start_time");



CREATE INDEX "reviews_created_at_idx" ON "public"."reviews" USING "btree" ("created_at" DESC);



CREATE INDEX "reviews_master_id_idx" ON "public"."reviews" USING "btree" ("master_id");



CREATE INDEX "reviews_story_id_idx" ON "public"."reviews" USING "btree" ("story_id");



CREATE INDEX "reviews_user_id_idx" ON "public"."reviews" USING "btree" ("user_id");



CREATE INDEX "session_participants_payment_status_idx" ON "public"."session_participants" USING "btree" ("payment_status");



CREATE INDEX "session_participants_session_user_idx" ON "public"."session_participants" USING "btree" ("session_id", "user_id");



CREATE INDEX "story_favorites_story_id_idx" ON "public"."story_favorites" USING "btree" ("story_id");



CREATE INDEX "story_favorites_user_id_idx" ON "public"."story_favorites" USING "btree" ("user_id");



CREATE UNIQUE INDEX "story_favorites_user_story_unique_idx" ON "public"."story_favorites" USING "btree" ("user_id", "story_id");



CREATE INDEX "story_inquiries_recipient_status_idx" ON "public"."story_inquiries" USING "btree" ("recipient_id", "status", "created_at" DESC);



CREATE INDEX "story_inquiries_sender_idx" ON "public"."story_inquiries" USING "btree" ("sender_id", "created_at" DESC);



CREATE INDEX "story_inquiries_story_idx" ON "public"."story_inquiries" USING "btree" ("story_id", "created_at" DESC);



CREATE INDEX "story_inquiry_messages_inquiry_created_idx" ON "public"."story_inquiry_messages" USING "btree" ("inquiry_id", "created_at");



CREATE INDEX "story_purchases_payment_status_idx" ON "public"."story_purchases" USING "btree" ("payment_status");



CREATE INDEX "story_purchases_story_id_idx" ON "public"."story_purchases" USING "btree" ("story_id");



CREATE INDEX "story_purchases_user_id_idx" ON "public"."story_purchases" USING "btree" ("user_id");



CREATE UNIQUE INDEX "story_purchases_user_story_unique_idx" ON "public"."story_purchases" USING "btree" ("user_id", "story_id");



CREATE OR REPLACE TRIGGER "on_booking_cancelled_notify_master" AFTER UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."notify_master_on_booking_cancelled"();



CREATE OR REPLACE TRIGGER "on_booking_completed_notify_player" AFTER UPDATE OF "status" ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."notify_player_on_booking_completed"();



CREATE OR REPLACE TRIGGER "on_booking_create_notify_master" AFTER INSERT ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."notify_master_on_booking"();



CREATE OR REPLACE TRIGGER "on_booking_message_notify_user" AFTER INSERT ON "public"."booking_messages" FOR EACH ROW EXECUTE FUNCTION "public"."notify_user_on_booking_message"();



CREATE OR REPLACE TRIGGER "on_booking_status_notify_users" AFTER UPDATE OF "status" ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_booking_status_change"();



CREATE OR REPLACE TRIGGER "on_review_create_notify_master" AFTER INSERT ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."notify_master_on_review"();



CREATE OR REPLACE TRIGGER "story_inquiry_message_notify" AFTER INSERT ON "public"."story_inquiry_messages" FOR EACH ROW EXECUTE FUNCTION "public"."notify_story_inquiry_message"();



CREATE OR REPLACE TRIGGER "trg_conversation_message_notification" AFTER INSERT ON "public"."conversation_messages" FOR EACH ROW EXECUTE FUNCTION "public"."create_conversation_message_notification"();



CREATE OR REPLACE TRIGGER "trg_touch_conversation_after_message" AFTER INSERT ON "public"."conversation_messages" FOR EACH ROW EXECUTE FUNCTION "public"."touch_conversation_after_message"();



ALTER TABLE ONLY "public"."booking_messages"
    ADD CONSTRAINT "booking_messages_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_messages"
    ADD CONSTRAINT "booking_messages_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_messages"
    ADD CONSTRAINT "booking_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_messages"
    ADD CONSTRAINT "conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_messages"
    ADD CONSTRAINT "conversation_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_master_id_fkey" FOREIGN KEY ("master_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_public_session_id_fkey" FOREIGN KEY ("public_session_id") REFERENCES "public"."public_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."master_availability"
    ADD CONSTRAINT "master_availability_master_id_fkey" FOREIGN KEY ("master_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "public"."story_inquiries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_events"
    ADD CONSTRAINT "payment_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_events"
    ADD CONSTRAINT "payment_events_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_events"
    ADD CONSTRAINT "payment_events_story_purchase_id_fkey" FOREIGN KEY ("story_purchase_id") REFERENCES "public"."story_purchases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_events"
    ADD CONSTRAINT "payment_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."public_sessions"
    ADD CONSTRAINT "public_sessions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_master_id_fkey" FOREIGN KEY ("master_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_participants"
    ADD CONSTRAINT "session_participants_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."public_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_participants"
    ADD CONSTRAINT "session_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stories"
    ADD CONSTRAINT "stories_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stories"
    ADD CONSTRAINT "stories_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."story_inquiries"
    ADD CONSTRAINT "story_inquiries_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."story_inquiries"
    ADD CONSTRAINT "story_inquiries_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."story_inquiries"
    ADD CONSTRAINT "story_inquiries_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."story_inquiry_messages"
    ADD CONSTRAINT "story_inquiry_messages_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "public"."story_inquiries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."story_inquiry_messages"
    ADD CONSTRAINT "story_inquiry_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."story_materials"
    ADD CONSTRAINT "story_materials_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."story_purchases"
    ADD CONSTRAINT "story_purchases_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."story_purchases"
    ADD CONSTRAINT "story_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Authenticated users can create marketplace notifications" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can create notifications" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users create public sessions" ON "public"."public_sessions" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "Authenticated users update public sessions" ON "public"."public_sessions" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Availability readable by everyone" ON "public"."master_availability" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Bookings readable by player or story master" ON "public"."bookings" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "master_id") OR (EXISTS ( SELECT 1
   FROM "public"."stories" "s"
  WHERE (("s"."id" = "bookings"."story_id") AND (("s"."author_id" = "auth"."uid"()) OR ("s"."owner_id" = "auth"."uid"())))))));



CREATE POLICY "Bookings update by involved users" ON "public"."bookings" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "master_id") OR (EXISTS ( SELECT 1
   FROM "public"."stories" "s"
  WHERE (("s"."id" = "bookings"."story_id") AND (("s"."author_id" = "auth"."uid"()) OR ("s"."owner_id" = "auth"."uid"()))))))) WITH CHECK ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "master_id") OR (EXISTS ( SELECT 1
   FROM "public"."stories" "s"
  WHERE (("s"."id" = "bookings"."story_id") AND (("s"."author_id" = "auth"."uid"()) OR ("s"."owner_id" = "auth"."uid"())))))));



CREATE POLICY "Masters manage own availability" ON "public"."master_availability" TO "authenticated" USING (("auth"."uid"() = "master_id")) WITH CHECK (("auth"."uid"() = "master_id"));



CREATE POLICY "Participants can read conversation messages" ON "public"."conversation_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "conversation_messages"."conversation_id") AND (("c"."player_id" = "auth"."uid"()) OR ("c"."master_id" = "auth"."uid"()))))));



CREATE POLICY "Participants can send conversation messages" ON "public"."conversation_messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "conversation_messages"."conversation_id") AND (("c"."player_id" = "auth"."uid"()) OR ("c"."master_id" = "auth"."uid"())))))));



CREATE POLICY "Participants can update their conversations" ON "public"."conversations" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "player_id") OR ("auth"."uid"() = "master_id"))) WITH CHECK ((("auth"."uid"() = "player_id") OR ("auth"."uid"() = "master_id")));



CREATE POLICY "Players can create story conversations" ON "public"."conversations" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "player_id") AND ("player_id" <> "master_id")));



CREATE POLICY "Players can create their own story inquiries" ON "public"."story_inquiries" FOR INSERT WITH CHECK ((("auth"."uid"() = "sender_id") AND ("sender_id" <> "recipient_id")));



CREATE POLICY "Players can review completed bookings" ON "public"."reviews" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."bookings" "b"
  WHERE (("b"."id" = "reviews"."booking_id") AND ("b"."user_id" = "auth"."uid"()) AND ("b"."story_id" = "b"."story_id") AND ("b"."master_id" = "b"."master_id") AND ("lower"(COALESCE("b"."status", ''::"text")) = ANY (ARRAY['completata'::"text", 'completa'::"text", 'completed'::"text", 'complete'::"text"])))))));



CREATE POLICY "Profiles are readable by authenticated users" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Public sessions readable by everyone" ON "public"."public_sessions" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Recipients can manage story inquiries" ON "public"."story_inquiries" FOR UPDATE USING (("auth"."uid"() = "recipient_id")) WITH CHECK (("auth"."uid"() = "recipient_id"));



CREATE POLICY "Reviews are publicly readable" ON "public"."reviews" FOR SELECT USING (true);



CREATE POLICY "Senders can delete their own story inquiries" ON "public"."story_inquiries" FOR DELETE USING (("auth"."uid"() = "sender_id"));



CREATE POLICY "Session participants readable by everyone" ON "public"."session_participants" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Stories are readable by everyone" ON "public"."stories" FOR SELECT TO "authenticated", "anon" USING ((("status" = 'published'::"text") OR ("auth"."uid"() = "author_id")));



CREATE POLICY "Story inquiries are visible to sender or recipient" ON "public"."story_inquiries" FOR SELECT USING ((("auth"."uid"() = "sender_id") OR ("auth"."uid"() = "recipient_id")));



CREATE POLICY "Story owners manage materials" ON "public"."story_materials" USING ((EXISTS ( SELECT 1
   FROM "public"."stories"
  WHERE (("stories"."id" = "story_materials"."story_id") AND ("stories"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."stories"
  WHERE (("stories"."id" = "story_materials"."story_id") AND ("stories"."owner_id" = "auth"."uid"())))));



CREATE POLICY "Story owners read bookings" ON "public"."bookings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."stories"
  WHERE (("stories"."id" = "bookings"."story_id") AND ("stories"."owner_id" = "auth"."uid"())))));



CREATE POLICY "Users can create own stories" ON "public"."stories" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "author_id"));



CREATE POLICY "Users can create own story purchases" ON "public"."story_purchases" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND ("payment_status" = ANY (ARRAY['not_required'::"text", 'not_active'::"text"]))));



CREATE POLICY "Users can delete own stories" ON "public"."stories" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "author_id"));



CREATE POLICY "Users can insert their own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can read their conversations" ON "public"."conversations" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "player_id") OR ("auth"."uid"() = "master_id")));



CREATE POLICY "Users can read their own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own stories" ON "public"."stories" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "author_id")) WITH CHECK (("auth"."uid"() = "author_id"));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own story purchases" ON "public"."story_purchases" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users create own bookings" ON "public"."bookings" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users delete own notifications" ON "public"."notifications" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users join sessions as themselves" ON "public"."session_participants" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own stories" ON "public"."stories" USING (("auth"."uid"() = "owner_id")) WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users read own bookings" ON "public"."bookings" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users read own notifications" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users update own notifications" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users update own session participation" ON "public"."session_participants" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."booking_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "booking_messages_insert_participants_window" ON "public"."booking_messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."bookings" "b"
  WHERE (("b"."id" = "booking_messages"."booking_id") AND ("lower"(COALESCE("b"."status", ''::"text")) = ANY (ARRAY['accettata'::"text", 'accepted'::"text"])) AND (("b"."user_id" = "auth"."uid"()) OR ("b"."master_id" = "auth"."uid"())) AND ("booking_messages"."recipient_id" =
        CASE
            WHEN ("b"."user_id" = "auth"."uid"()) THEN "b"."master_id"
            WHEN ("b"."master_id" = "auth"."uid"()) THEN "b"."user_id"
            ELSE NULL::"uuid"
        END) AND ((("b"."booking_date" + COALESCE("b"."start_time", '00:00:00'::time without time zone)) - '48:00:00'::interval) <= "now"()) AND ((("b"."booking_date" + COALESCE("b"."end_time", "b"."start_time", '23:59:00'::time without time zone)) + '24:00:00'::interval) >= "now"()))))));



CREATE POLICY "booking_messages_select_participants" ON "public"."booking_messages" FOR SELECT TO "authenticated" USING ((("sender_id" = "auth"."uid"()) OR ("recipient_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."bookings" "b"
  WHERE (("b"."id" = "booking_messages"."booking_id") AND (("b"."user_id" = "auth"."uid"()) OR ("b"."master_id" = "auth"."uid"())))))));



CREATE POLICY "booking_messages_update_read_recipient" ON "public"."booking_messages" FOR UPDATE TO "authenticated" USING (("recipient_id" = "auth"."uid"())) WITH CHECK (("recipient_id" = "auth"."uid"()));



ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversation_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."master_availability" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_events_select_own_or_master" ON "public"."payment_events" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "master_id")));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."public_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "story inquiry messages insert participants" ON "public"."story_inquiry_messages" FOR INSERT WITH CHECK ((("sender_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."story_inquiries" "si"
  WHERE (("si"."id" = "story_inquiry_messages"."inquiry_id") AND (("si"."sender_id" = "auth"."uid"()) OR ("si"."recipient_id" = "auth"."uid"())))))));



CREATE POLICY "story inquiry messages select participants" ON "public"."story_inquiry_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."story_inquiries" "si"
  WHERE (("si"."id" = "story_inquiry_messages"."inquiry_id") AND (("si"."sender_id" = "auth"."uid"()) OR ("si"."recipient_id" = "auth"."uid"()))))));



ALTER TABLE "public"."story_favorites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "story_favorites_delete_own" ON "public"."story_favorites" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "story_favorites_insert_own" ON "public"."story_favorites" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "story_favorites_select_own" ON "public"."story_favorites" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."story_inquiries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."story_inquiry_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."story_materials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."story_purchases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "story_purchases_select_own_or_master" ON "public"."story_purchases" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "master_id")));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."create_conversation_message_notification"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_conversation_message_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_conversation_message_notification"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_master_on_booking"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_master_on_booking"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_master_on_booking"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_master_on_booking_cancelled"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_master_on_booking_cancelled"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_master_on_booking_cancelled"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_master_on_review"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_master_on_review"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_master_on_review"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_on_booking_status_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_on_booking_status_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_on_booking_status_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_player_on_booking_completed"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_player_on_booking_completed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_player_on_booking_completed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_story_inquiry_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_story_inquiry_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_story_inquiry_message"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_user_on_booking_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_user_on_booking_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_user_on_booking_message"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_conversation_after_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_conversation_after_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_conversation_after_message"() TO "service_role";


















GRANT ALL ON TABLE "public"."booking_messages" TO "anon";
GRANT ALL ON TABLE "public"."booking_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_messages" TO "service_role";



GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_messages" TO "anon";
GRANT ALL ON TABLE "public"."conversation_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_messages" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."master_availability" TO "anon";
GRANT ALL ON TABLE "public"."master_availability" TO "authenticated";
GRANT ALL ON TABLE "public"."master_availability" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."payment_events" TO "anon";
GRANT ALL ON TABLE "public"."payment_events" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_events" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."public_sessions" TO "anon";
GRANT ALL ON TABLE "public"."public_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."public_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON TABLE "public"."session_participants" TO "anon";
GRANT ALL ON TABLE "public"."session_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."session_participants" TO "service_role";



GRANT ALL ON TABLE "public"."stories" TO "anon";
GRANT ALL ON TABLE "public"."stories" TO "authenticated";
GRANT ALL ON TABLE "public"."stories" TO "service_role";



GRANT ALL ON TABLE "public"."story_favorites" TO "anon";
GRANT ALL ON TABLE "public"."story_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."story_favorites" TO "service_role";



GRANT ALL ON TABLE "public"."story_inquiries" TO "anon";
GRANT ALL ON TABLE "public"."story_inquiries" TO "authenticated";
GRANT ALL ON TABLE "public"."story_inquiries" TO "service_role";



GRANT ALL ON TABLE "public"."story_inquiry_messages" TO "anon";
GRANT ALL ON TABLE "public"."story_inquiry_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."story_inquiry_messages" TO "service_role";



GRANT ALL ON TABLE "public"."story_materials" TO "anon";
GRANT ALL ON TABLE "public"."story_materials" TO "authenticated";
GRANT ALL ON TABLE "public"."story_materials" TO "service_role";



GRANT ALL ON TABLE "public"."story_purchases" TO "anon";
GRANT ALL ON TABLE "public"."story_purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."story_purchases" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

drop policy "Availability readable by everyone" on "public"."master_availability";

drop policy "Public sessions readable by everyone" on "public"."public_sessions";

drop policy "Session participants readable by everyone" on "public"."session_participants";

drop policy "Stories are readable by everyone" on "public"."stories";


  create policy "Availability readable by everyone"
  on "public"."master_availability"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "Public sessions readable by everyone"
  on "public"."public_sessions"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "Session participants readable by everyone"
  on "public"."session_participants"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "Stories are readable by everyone"
  on "public"."stories"
  as permissive
  for select
  to anon, authenticated
using (((status = 'published'::text) OR (auth.uid() = author_id)));



  create policy "Story covers are public"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'story-covers'::text));



  create policy "Story materials are public"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'story-materials'::text));



  create policy "Users can delete own story covers"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'story-covers'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));



  create policy "Users can delete own story materials"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'story-materials'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));



  create policy "Users can update own story covers"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'story-covers'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])))
with check (((bucket_id = 'story-covers'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));



  create policy "Users can update own story materials"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'story-materials'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])))
with check (((bucket_id = 'story-materials'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));



  create policy "Users can upload own story covers"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'story-covers'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));



  create policy "Users can upload own story materials"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'story-materials'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));



  create policy "avatars_delete_own_folder"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "avatars_insert_own_folder"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "avatars_public_read"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'avatars'::text));



  create policy "avatars_update_own_folder"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)))
with check (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



