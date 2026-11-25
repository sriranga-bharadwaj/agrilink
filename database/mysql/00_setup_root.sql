-- AgriLink: one-time setup. Run as root:
--   mysql -u root -p < database/mysql/00_setup_root.sql

CREATE DATABASE IF NOT EXISTS agrilink
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'agrilink'@'localhost' IDENTIFIED BY 'agrilink_dev';
GRANT ALL PRIVILEGES ON agrilink.* TO 'agrilink'@'localhost';
FLUSH PRIVILEGES;

-- Binary logging is on by default in MySQL 8, which blocks non-SUPER users
-- from creating stored functions/triggers unless this is enabled.
SET GLOBAL log_bin_trust_function_creators = 1;

-- Needed for the daily listing-expiry event.
SET GLOBAL event_scheduler = ON;
