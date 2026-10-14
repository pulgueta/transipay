#!/bin/sh
# Makes the database roles for local development.
# The Postgres image runs this script as the superuser one time, when it makes a new data volume.
# You can run it again. It does not fail when the roles exist.
#
# transipay_app: NOLOGIN role. Migration 0005 gives it the table privileges.
# transipay_web: login role for the app. It is a member of transipay_app and does not own the tables.
set -eu

: "${TRANSIPAY_WEB_PASSWORD:?Set TRANSIPAY_WEB_PASSWORD}"

# psql sends :'web_password' as a quoted literal, so the password cannot change the SQL.
psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set web_password="$TRANSIPAY_WEB_PASSWORD" <<'SQL'
SELECT 'CREATE ROLE transipay_app NOLOGIN'
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'transipay_app')
\gexec
SELECT 'CREATE ROLE transipay_web LOGIN'
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'transipay_web')
\gexec
ALTER ROLE transipay_web WITH LOGIN PASSWORD :'web_password';
GRANT transipay_app TO transipay_web;
SQL
