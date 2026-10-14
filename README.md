<img src="assets/icon.svg" width="64" height="64" alt="">

# transipay

Created in [T3 Code](https://t3.codes).

## Database roles

- The app connects as a login role that is a member of `transipay_app` (in local development, `transipay_web`). This role does not own the tables, so the protections of migration 0005 apply to it.
- Migrations run as the table owner. drizzle-kit uses `DATABASE_OWNER_URL`. When it is not set, drizzle-kit uses `DATABASE_URL`.
- Migration 0005 makes `transipay_app` only when the role does not exist. To make it, the migration role must have CREATEROLE. In production, run `CREATE ROLE transipay_app NOLOGIN;` before the migrations, or run the migrations with a role that has CREATEROLE.
- In local development, `docs/postgres/init/01-app-role.sh` makes `transipay_app` and `transipay_web`. The Postgres image runs it only when it makes a new data volume. To make a new volume, run `podman compose down -v` (or `docker compose down -v`). This deletes all local data. To add the roles to a volume that exists, run `podman exec -i -e TRANSIPAY_WEB_PASSWORD=transipay_web transipay-pg sh < docs/postgres/init/01-app-role.sh`.
