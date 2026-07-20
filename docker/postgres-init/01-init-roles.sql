-- Runs once, automatically, on first init of the postgres container
-- (see docker-entrypoint-initdb.d in the official postgres image).
--
-- plexo_app: used by the API at runtime. NOT superuser, NOT BYPASSRLS,
-- so RLS policies (see prisma/migrations/*_row_level_security) actually apply.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'plexo_app') THEN
    CREATE ROLE plexo_app LOGIN PASSWORD 'plexo_dev_password' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT ALL ON SCHEMA public TO plexo_app;
