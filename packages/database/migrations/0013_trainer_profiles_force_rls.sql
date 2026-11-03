-- F005 (#320): force RLS on the new business table, as the conventions check demands (see 0009).
ALTER TABLE "trainer_profiles" FORCE ROW LEVEL SECURITY;
