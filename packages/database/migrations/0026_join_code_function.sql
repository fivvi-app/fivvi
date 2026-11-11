-- F029 (#898): the code of a workspace's join link. `new_join_code()` makes one: 8 characters of
-- Crockford's base32 (0-9 and A-Z without I, L, O and U), from Postgres's CSPRNG (`gen_random_uuid()`
-- is made from `pg_strong_random`). It is the default of `organizations.join_code` (next migration,
-- which also gives every existing workspace its code) and what a renewal calls, so a code is made
-- in one place. It reads nothing and runs as its caller, like the tenant-context functions.
--
-- A version 4 UUID has fixed bits at byte 6 (the version) and byte 8 (the variant); bytes 0-5 and
-- 10-15 are all random. 8 of them (0-5, 10 and 11) each give 5 bits (`& 31`) for one symbol of the
-- 32, so every symbol is equally likely.
CREATE FUNCTION new_join_code() RETURNS text
  LANGUAGE sql VOLATILE
  AS $$
    SELECT string_agg(
      substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', (get_byte(bytes.value, position.index) & 31) + 1, 1),
      '' ORDER BY position.ordinal
    )
    FROM (SELECT decode(replace(gen_random_uuid()::text, '-', ''), 'hex') AS value) AS bytes,
         unnest(ARRAY[0, 1, 2, 3, 4, 5, 10, 11]) WITH ORDINALITY AS position(index, ordinal)
  $$;
