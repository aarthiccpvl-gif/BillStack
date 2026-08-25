-- =============================================================================
--  Local MySQL setup for development (run once, as root).
--
--  Creates the application database, a separate database for the test suite, and
--  the low-privilege user the application connects as. Schema objects themselves
--  are owned by Prisma migrations — this file only prepares the ground.
--
--  Run:  "C:\wamp64\bin\mysql\mysql8.4.7\bin\mysql.exe" -u root -p < scripts\setup-mysql.sql
--        (WAMP's root password is empty by default — press Enter at the prompt)
-- =============================================================================

CREATE DATABASE IF NOT EXISTS `invoice_db`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Kept separate so `npm test` can never touch development data.
CREATE DATABASE IF NOT EXISTS `invoice_db_test`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Must match DATABASE_URL in .env. Change both together if you use a different password.
CREATE USER IF NOT EXISTS 'invoice'@'localhost' IDENTIFIED BY 'invoice';
CREATE USER IF NOT EXISTS 'invoice'@'127.0.0.1' IDENTIFIED BY 'invoice';

GRANT ALL PRIVILEGES ON `invoice_db`.* TO 'invoice'@'localhost';
GRANT ALL PRIVILEGES ON `invoice_db_test`.* TO 'invoice'@'localhost';
GRANT ALL PRIVILEGES ON `invoice_db`.* TO 'invoice'@'127.0.0.1';
GRANT ALL PRIVILEGES ON `invoice_db_test`.* TO 'invoice'@'127.0.0.1';

-- `prisma migrate dev` creates a temporary shadow database to diff against, which
-- needs these global privileges. Development only — a production user should be
-- limited to its own schema and use `prisma migrate deploy`, which needs no shadow
-- database at all.
GRANT CREATE, DROP, ALTER, REFERENCES ON *.* TO 'invoice'@'localhost';
GRANT CREATE, DROP, ALTER, REFERENCES ON *.* TO 'invoice'@'127.0.0.1';

FLUSH PRIVILEGES;

SELECT
  'Databases ready'                                        AS status,
  (SELECT COUNT(*) FROM information_schema.schemata
    WHERE schema_name IN ('invoice_db', 'invoice_db_test')) AS databases_created,
  (SELECT COUNT(*) FROM mysql.user
    WHERE user = 'invoice')                                AS users_created;
