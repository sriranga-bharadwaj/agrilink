-- AgriLink: walkthrough of the core SQL features (good for report screenshots).
-- Some steps fail ON PURPOSE to show constraints/triggers, so run with --force:
--   mysql -u agrilink -p --force --table agrilink < database/mysql/06_demo.sql
USE agrilink;

-- 1. Marketplace and demand board
SELECT * FROM v_active_listings ORDER BY crop_name, price_per_kg;
SELECT * FROM v_open_requirements;

-- 2. Matching: FreshBite needs 2500 kg tomato, <= Rs 20/kg, grade B+, within 150 km.
--    Listing 3 (Rs 22) is too costly and listing 13 is stale, so neither appears.
CALL sp_find_matches(1);

-- 3. Transactional order: buy 1500 kg from the top match (listing 1)
CALL sp_place_order(7, 1, 1, 1500, @o1);
SELECT @o1 AS new_order_id;
SELECT listing_id, quantity_kg, available_kg, status FROM listings WHERE listing_id = 1;
SELECT requirement_id, quantity_kg, fulfilled_kg, status FROM requirements WHERE requirement_id = 1;

-- 4. Overselling is blocked and rolled back (only 500 kg left)          -- EXPECTED ERROR
CALL sp_place_order(7, 1, 1, 800, @bad);

-- 5. Buy the last 500 kg: trigger flips the listing to SOLD_OUT
CALL sp_place_order(7, 1, 1, 500, @o2);
SELECT listing_id, available_kg, status FROM listings WHERE listing_id = 1;

-- 6. Order lifecycle is enforced by trigger: PLACED -> DELIVERED is illegal  -- EXPECTED ERROR
UPDATE orders SET status = 'DELIVERED' WHERE order_id = @o1;

-- 7. Review before delivery is rejected                                  -- EXPECTED ERROR
INSERT INTO reviews (order_id, reviewer_id, rating) VALUES (@o1, 7, 4);

-- 8. Cancelling an order returns stock and reopens the listing and requirement
UPDATE orders SET status = 'CANCELLED' WHERE order_id = @o2;
SELECT listing_id, available_kg, status FROM listings WHERE listing_id = 1;
SELECT requirement_id, fulfilled_kg, status FROM requirements WHERE requirement_id = 1;

-- 9. Full happy path with automatic delivery tracking
UPDATE orders SET status = 'CONFIRMED' WHERE order_id = @o1;
UPDATE orders SET status = 'SHIPPED'   WHERE order_id = @o1;
UPDATE orders SET status = 'DELIVERED' WHERE order_id = @o1;
INSERT INTO reviews (order_id, reviewer_id, rating, comment) VALUES (@o1, 7, 4, 'Good colour, few bruised.');
SELECT * FROM order_status_history WHERE order_id IN (@o1, @o2) ORDER BY history_id;
SELECT * FROM v_order_details;

-- 10. CHECK constraints                                                  -- EXPECTED ERRORS
INSERT INTO listings (farmer_id, crop_id, quantity_kg, price_per_kg, quality_grade, harvest_date, available_until)
VALUES (1, 1, 100, -5, 'A', CURDATE(), CURDATE() + INTERVAL 3 DAY);       -- negative price
INSERT INTO listings (farmer_id, crop_id, quantity_kg, price_per_kg, quality_grade, harvest_date, available_until)
VALUES (1, 1, 100, 10, 'A', CURDATE() + INTERVAL 2 DAY, CURDATE() + INTERVAL 5 DAY);  -- future harvest

-- 11. Expiry job (normally run daily by ev_expire_stale)
CALL sp_expire_stale();
SELECT listing_id, available_until, status FROM listings WHERE listing_id = 13;

-- 12. Dashboards
SELECT * FROM v_farmer_earnings ORDER BY earned DESC;
SELECT * FROM v_buyer_spend ORDER BY total_spend DESC;
SELECT * FROM v_crop_market_summary ORDER BY demand_supply_ratio DESC;

-- 13. Index use for the matching filter
EXPLAIN SELECT listing_id FROM listings
 WHERE crop_id = 1 AND status = 'ACTIVE' AND price_per_kg <= 20;
