-- AgriLink: stored procedures and scheduled event
USE agrilink;

DROP PROCEDURE IF EXISTS sp_find_matches;
DROP PROCEDURE IF EXISTS sp_place_order;
DROP PROCEDURE IF EXISTS sp_expire_stale;
DROP EVENT IF EXISTS ev_expire_stale;

DELIMITER $$

-- ---------------------------------------------------------------------------
-- sp_find_matches: rank listings that can satisfy a requirement.
--
-- Hard filters: same crop, listing ACTIVE and in stock, not past its
-- available_until, price <= buyer's max, grade at least the buyer's minimum,
-- organic if required, within the buyer's max distance.
--
-- Score (0-100):
--   price      30  cheaper relative to the buyer's max scores higher (15..30)
--   quantity   25  how much of the remaining need this listing covers
--   distance   20  closer is better
--   freshness  15  days since harvest vs. the crop's shelf life
--   quality    10  A=10, B=6, C=3
-- ---------------------------------------------------------------------------
CREATE PROCEDURE sp_find_matches(IN p_requirement_id INT UNSIGNED)
BEGIN
  DECLARE v_status VARCHAR(20);

  SELECT status INTO v_status FROM requirements WHERE requirement_id = p_requirement_id;
  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Requirement not found';
  END IF;
  IF v_status <> 'OPEN' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Requirement is not open';
  END IF;

  -- Recompute suggestions; keep matches the buyer already accepted/rejected.
  DELETE FROM matches WHERE requirement_id = p_requirement_id AND status = 'SUGGESTED';

  INSERT INTO matches (requirement_id, listing_id, score, distance_km)
  SELECT r.requirement_id,
         l.listing_id,
         ROUND(
             30 * (1 - 0.5 * l.price_per_kg / r.max_price_per_kg)
           + 25 * LEAST(1, l.available_kg / GREATEST(r.quantity_kg - r.fulfilled_kg, 1))
           + 20 * (1 - d.distance_km / r.max_distance_km)
           + 15 * GREATEST(0, 1 - DATEDIFF(CURDATE(), l.harvest_date) / c.shelf_life_days)
           + 10 * CASE l.quality_grade WHEN 'A' THEN 1 WHEN 'B' THEN 0.6 ELSE 0.3 END
         , 2),
         d.distance_km
    FROM requirements r
    JOIN buyers   b ON b.buyer_id  = r.buyer_id
    JOIN listings l ON l.crop_id   = r.crop_id
    JOIN farmers  f ON f.farmer_id = l.farmer_id
    JOIN crops    c ON c.crop_id   = l.crop_id
    CROSS JOIN LATERAL (
      SELECT fn_distance_km(f.latitude, f.longitude, b.latitude, b.longitude) AS distance_km
    ) d
   WHERE r.requirement_id = p_requirement_id
     AND l.status = 'ACTIVE'
     AND l.available_kg > 0
     AND l.available_until >= CURDATE()
     AND l.harvest_date <= r.required_by
     AND l.price_per_kg <= r.max_price_per_kg
     AND fn_grade_rank(l.quality_grade) <= fn_grade_rank(r.min_quality_grade)
     AND (r.organic_only = FALSE OR l.is_organic = TRUE)
     AND d.distance_km <= r.max_distance_km
     AND NOT EXISTS (SELECT 1 FROM matches m
                      WHERE m.requirement_id = r.requirement_id
                        AND m.listing_id = l.listing_id);

  SELECT RANK() OVER (ORDER BY m.score DESC) AS match_rank,
         m.match_id, m.status AS match_status, m.score, m.distance_km,
         l.listing_id, f.farm_name, f.district, c.crop_name, l.variety,
         l.available_kg, l.price_per_kg, l.quality_grade, l.is_organic,
         l.harvest_date
    FROM matches m
    JOIN listings l ON l.listing_id = m.listing_id
    JOIN farmers  f ON f.farmer_id  = l.farmer_id
    JOIN crops    c ON c.crop_id    = l.crop_id
   WHERE m.requirement_id = p_requirement_id
   ORDER BY m.score DESC;
END$$

-- ---------------------------------------------------------------------------
-- sp_place_order: atomic purchase.
-- Locks the listing row (and requirement row) with SELECT ... FOR UPDATE so two
-- buyers cannot oversell the same stock. Any error rolls back everything.
-- ---------------------------------------------------------------------------
CREATE PROCEDURE sp_place_order(
  IN  p_buyer_id        INT UNSIGNED,
  IN  p_listing_id      INT UNSIGNED,
  IN  p_requirement_id  INT UNSIGNED,   -- NULL for a direct purchase
  IN  p_quantity_kg     DECIMAL(10,2),
  OUT p_order_id        INT UNSIGNED
)
BEGIN
  DECLARE v_available     DECIMAL(10,2);
  DECLARE v_price         DECIMAL(8,2);
  DECLARE v_status        VARCHAR(20);
  DECLARE v_crop          SMALLINT UNSIGNED;
  DECLARE v_req_buyer     INT UNSIGNED;
  DECLARE v_req_crop      SMALLINT UNSIGNED;
  DECLARE v_req_status    VARCHAR(20);
  DECLARE v_req_remaining DECIMAL(10,2);
  DECLARE v_msg           VARCHAR(200);

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SET p_order_id = NULL;

  IF p_quantity_kg IS NULL OR p_quantity_kg <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Quantity must be greater than zero';
  END IF;

  START TRANSACTION;

  SELECT available_kg, price_per_kg, status, crop_id
    INTO v_available, v_price, v_status, v_crop
    FROM listings
   WHERE listing_id = p_listing_id
     FOR UPDATE;

  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Listing not found';
  END IF;
  IF v_status <> 'ACTIVE' THEN
    SET v_msg = CONCAT('Listing is ', v_status);
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;
  IF p_quantity_kg > v_available THEN
    SET v_msg = CONCAT('Only ', v_available, ' kg available');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;

  IF p_requirement_id IS NOT NULL THEN
    SELECT buyer_id, crop_id, status, quantity_kg - fulfilled_kg
      INTO v_req_buyer, v_req_crop, v_req_status, v_req_remaining
      FROM requirements
     WHERE requirement_id = p_requirement_id
       FOR UPDATE;

    IF v_req_buyer IS NULL OR v_req_buyer <> p_buyer_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Requirement does not belong to this buyer';
    END IF;
    IF v_req_crop <> v_crop THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Listing crop does not match requirement';
    END IF;
    IF v_req_status <> 'OPEN' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Requirement is not open';
    END IF;
    IF p_quantity_kg > v_req_remaining THEN
      SET v_msg = CONCAT('Requirement needs only ', v_req_remaining, ' kg more');
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
    END IF;
  END IF;

  UPDATE listings
     SET available_kg = available_kg - p_quantity_kg
   WHERE listing_id = p_listing_id;

  INSERT INTO orders (buyer_id, listing_id, requirement_id, quantity_kg, price_per_kg)
  VALUES (p_buyer_id, p_listing_id, p_requirement_id, p_quantity_kg, v_price);
  SET p_order_id = LAST_INSERT_ID();

  IF p_requirement_id IS NOT NULL THEN
    -- MySQL evaluates SET left to right, so status sees the new fulfilled_kg.
    UPDATE requirements
       SET fulfilled_kg = fulfilled_kg + p_quantity_kg,
           status = IF(fulfilled_kg >= quantity_kg, 'FULFILLED', status)
     WHERE requirement_id = p_requirement_id;

    UPDATE matches
       SET status = 'ACCEPTED'
     WHERE requirement_id = p_requirement_id AND listing_id = p_listing_id;
  END IF;

  COMMIT;
END$$

-- ---------------------------------------------------------------------------
-- sp_expire_stale: expire listings past available_until and requirements
-- past required_by. Run daily by ev_expire_stale.
-- ---------------------------------------------------------------------------
CREATE PROCEDURE sp_expire_stale()
BEGIN
  DECLARE v_listings INT;
  DECLARE v_requirements INT;

  UPDATE listings SET status = 'EXPIRED'
   WHERE status = 'ACTIVE' AND available_until < CURDATE();
  SET v_listings = ROW_COUNT();

  UPDATE requirements SET status = 'EXPIRED'
   WHERE status = 'OPEN' AND required_by < CURDATE();
  SET v_requirements = ROW_COUNT();

  SELECT v_listings AS listings_expired, v_requirements AS requirements_expired;
END$$

CREATE EVENT ev_expire_stale
ON SCHEDULE EVERY 1 DAY STARTS (CURRENT_DATE + INTERVAL 1 DAY)
DO CALL sp_expire_stale()$$

DELIMITER ;
