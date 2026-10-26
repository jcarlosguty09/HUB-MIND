-- HYROX week 2026-10-26 through 2026-11-01. Run after preview. Does not overwrite existing HYROX or other programs.
BEGIN;
DO $hyrox$
DECLARE
  org uuid := 'e775f0f4-30e7-48e1-805c-1cd06d85248e';
  entry record;
  previous jsonb;
BEGIN
  FOR entry IN SELECT key::date AS day, value AS new_hyrox FROM jsonb_each('{"2026-10-26":[{"id":"hyrox-2026-10-26-1","name":"ENGINE + SLED","content":"10 min warm-up. 3 rounds: 6 min SkiErg RPE 6, 4 min run RPE 6, 2 min easy. Then 5 sets: 20 m sled push + 20 m sled pull moderate; 2 min rest. Cool down 5 min.","timerMode":"stopwatch","timerConfig":{}}],"2026-10-27":[{"id":"hyrox-2026-10-27-1","name":"RUN THRESHOLD + WALL BALL","content":"10 min warm-up. 5 x (4 min run RPE 7-8 + 2 min easy). 4 x 250 m Row strong, 1 min easy. Then 4 sets: 12 wall balls + 20 m sandbag lunges; technique first.","timerMode":"stopwatch","timerConfig":{}}],"2026-10-28":[{"id":"hyrox-2026-10-28-1","name":"MIXED ENDURANCE","content":"Every 10 min x 5: 600 m run + 400 m SkiErg on odd rounds / 400 m Row on even rounds. Recover remaining time. RPE 6-7. Then 3 quality rounds: 80 m farmer carry + 12 step-ups + 40 sec plank.","timerMode":"stopwatch","timerConfig":{}}],"2026-10-29":[{"id":"hyrox-2026-10-29-1","name":"ACTIVE RECOVERY","content":"35-45 min Zone 2 easy run, BikeErg or Row; conversational pace. Then 10 min mobility. Beginners 25-30 min.","timerMode":"stopwatch","timerConfig":{}}],"2026-10-30":[{"id":"hyrox-2026-10-30-1","name":"FRIDAY RACE PACE","content":"Warm-up 12 min. 3 rounds: 800 m run at planned race pace + 500 m Row, recover to 12 min mark; 3 min easy between. Then 4 rounds: 15 m sled push + 15 m sled pull + 8 burpee broad jumps, rest 2 min. Controlled load.","timerMode":"stopwatch","timerConfig":{}}],"2026-10-31":[{"id":"hyrox-2026-10-31-1","name":"PARTNER GRIND","content":"Teams of 2, 55 min cap: 1000 m run together, 1000 m Ski shared, 1000 m run, 50 m sled push shared, 1000 m run, 50 m sled pull shared, 1000 m run, 80 m burpee broad jumps shared, 1000 m run, 1000 m Row shared. Beginners scale to 60-70%.","timerMode":"stopwatch","timerConfig":{}}],"2026-11-01":[{"id":"hyrox-2026-11-01-1","name":"SUNDAY CONTROLLED SIMULATION","content":"60-75% simulation: 6 x 600 m run, alternating with stations 1) 600 m Ski 2) 25 m sled push 3) 25 m sled pull 4) 40 m burpee broad jumps 5) 600 m Row 6) 100 m farmer carry. Finish 40 m sandbag lunges + 50 wall balls. Scale loads; stagger heats.","timerMode":"stopwatch","timerConfig":{}}]} '::jsonb) LOOP
    SELECT sections INTO previous FROM public.wod_days WHERE organization_id=org AND date=entry.day FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.wod_days(organization_id,date,sections) VALUES(org,entry.day,jsonb_build_object('hyrox',entry.new_hyrox));
    ELSIF previous->'hyrox' IS NULL OR previous->'hyrox'='[]'::jsonb THEN
      UPDATE public.wod_days SET sections=jsonb_set(COALESCE(previous,'{}'::jsonb),'{hyrox}',entry.new_hyrox,true) WHERE organization_id=org AND date=entry.day;
    ELSE
      RAISE NOTICE 'HYROX already exists on %, skipped without modification',entry.day;
    END IF;
  END LOOP;
END $hyrox$;
COMMIT;
