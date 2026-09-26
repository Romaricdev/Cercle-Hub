CREATE USER cercle_migrator WITH PASSWORD 'local-migrator-only';
CREATE USER cercle_app WITH PASSWORD 'local-app-only';
ALTER DATABASE cercle_complet OWNER TO cercle_migrator;
CREATE DATABASE cercle_complet_test OWNER cercle_migrator;
GRANT CONNECT ON DATABASE cercle_complet TO cercle_app;
GRANT CONNECT ON DATABASE cercle_complet_test TO cercle_app;
GRANT CONNECT ON DATABASE cercle_complet TO cercle_migrator;
GRANT CONNECT ON DATABASE cercle_complet_test TO cercle_migrator;

\c cercle_complet
ALTER SCHEMA public OWNER TO cercle_migrator;
GRANT USAGE ON SCHEMA public TO cercle_app;

\c cercle_complet_test
ALTER SCHEMA public OWNER TO cercle_migrator;
GRANT USAGE ON SCHEMA public TO cercle_app;
