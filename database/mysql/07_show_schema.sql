-- AgriLink: show the database structure (for presenting in Workbench).
-- Run one statement at a time with Ctrl+Enter, or all with Ctrl+Shift+Enter.
USE agrilink;

-- 1. All tables and views with row counts
SELECT TABLE_NAME, TABLE_TYPE, TABLE_ROWS
  FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = 'agrilink'
 ORDER BY TABLE_TYPE, TABLE_NAME;

-- 2. Relational schema: every column with type and key (PRI = primary, MUL = foreign/indexed, UNI = unique)
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, EXTRA
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = 'agrilink'
   AND TABLE_NAME IN (SELECT TABLE_NAME FROM information_schema.TABLES
                       WHERE TABLE_SCHEMA = 'agrilink' AND TABLE_TYPE = 'BASE TABLE')
 ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- 3. Relationships: every foreign key -> referenced primary key (the lines of the ER diagram)
SELECT k.TABLE_NAME AS from_table, k.COLUMN_NAME AS fk_column,
       k.REFERENCED_TABLE_NAME AS to_table, k.REFERENCED_COLUMN_NAME AS to_column,
       r.DELETE_RULE, k.CONSTRAINT_NAME
  FROM information_schema.KEY_COLUMN_USAGE k
  JOIN information_schema.REFERENTIAL_CONSTRAINTS r
    ON r.CONSTRAINT_SCHEMA = k.TABLE_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
 WHERE k.TABLE_SCHEMA = 'agrilink'
 ORDER BY from_table, fk_column;

-- 4. CHECK and UNIQUE constraints
SELECT tc.TABLE_NAME, tc.CONSTRAINT_TYPE, tc.CONSTRAINT_NAME, cc.CHECK_CLAUSE
  FROM information_schema.TABLE_CONSTRAINTS tc
  LEFT JOIN information_schema.CHECK_CONSTRAINTS cc
    ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
 WHERE tc.TABLE_SCHEMA = 'agrilink' AND tc.CONSTRAINT_TYPE IN ('CHECK', 'UNIQUE')
 ORDER BY tc.TABLE_NAME, tc.CONSTRAINT_TYPE;

-- 5. Indexes
SELECT TABLE_NAME, INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns_, NON_UNIQUE
  FROM information_schema.STATISTICS
 WHERE TABLE_SCHEMA = 'agrilink'
 GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE
 ORDER BY TABLE_NAME, INDEX_NAME;

-- 6. Triggers, procedures/functions, event
SELECT TRIGGER_NAME, ACTION_TIMING, EVENT_MANIPULATION, EVENT_OBJECT_TABLE
  FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = 'agrilink' ORDER BY EVENT_OBJECT_TABLE;
SELECT ROUTINE_NAME, ROUTINE_TYPE
  FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = 'agrilink' ORDER BY ROUTINE_TYPE;
SELECT EVENT_NAME, INTERVAL_VALUE, INTERVAL_FIELD, STATUS
  FROM information_schema.EVENTS WHERE EVENT_SCHEMA = 'agrilink';

-- 7. Full definition of one table / trigger / procedure
SHOW CREATE TABLE orders;
SHOW CREATE TRIGGER trg_orders_bu;
SHOW CREATE PROCEDURE sp_place_order;
