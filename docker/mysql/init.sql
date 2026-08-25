-- Runs once, on first container start, before Prisma migrations.
-- Schema objects are owned by Prisma; this file only prepares the databases.

CREATE DATABASE IF NOT EXISTS `invoice_db`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Separate database for the integration test suite so `npm test` can never
-- truncate development data.
CREATE DATABASE IF NOT EXISTS `invoice_db_test`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON `invoice_db`.* TO 'invoice'@'%';
GRANT ALL PRIVILEGES ON `invoice_db_test`.* TO 'invoice'@'%';

-- Prisma needs the shadow-database privilege to diff migrations.
GRANT CREATE, DROP, ALTER, REFERENCES ON *.* TO 'invoice'@'%';

FLUSH PRIVILEGES;
