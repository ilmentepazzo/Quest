-- prelaunch_security_constraints.sql
-- Run these in staging after verifying duplicates. Do NOT run on production without testing.

-- 1) Check for duplicates in story_purchases
SELECT user_id, story_id, count(*) AS occurrences
FROM story_purchases
GROUP BY user_id, story_id
HAVING count(*) > 1;

-- 2) If no duplicates, create unique constraint to avoid race-condition duplicates
ALTER TABLE IF EXISTS story_purchases
ADD CONSTRAINT IF NOT EXISTS unique_user_story UNIQUE (user_id, story_id);

-- 3) Check for duplicates in payment_events (provider + provider_event_id)
SELECT provider, provider_event_id, count(*) AS occurrences
FROM payment_events
GROUP BY provider, provider_event_id
HAVING count(*) > 1;

-- 4) If no duplicates, add unique constraint
ALTER TABLE IF EXISTS payment_events
ADD CONSTRAINT IF NOT EXISTS unique_provider_event UNIQUE (provider, provider_event_id);

-- 5) Index to speed lookups
CREATE INDEX IF NOT EXISTS idx_story_purchases_payment_reference ON story_purchases (payment_reference);
