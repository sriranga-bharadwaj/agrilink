-- AgriLink: stored functions and triggers
USE agrilink;

DROP FUNCTION IF EXISTS fn_grade_rank;
DROP FUNCTION IF EXISTS fn_distance_km;
DROP TRIGGER IF EXISTS trg_listings_bi;
DROP TRIGGER IF EXISTS trg_listings_bu;
DROP TRIGGER IF EXISTS trg_orders_ai;
DROP TRIGGER IF EXISTS trg_orders_bu;
DROP TRIGGER IF EXISTS trg_orders_au;
DROP TRIGGER IF EXISTS trg_reviews_bi;

DELIMITER $$

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Quality grade as a comparable number: A=1 (best) .. C=3
CREATE FUNCTION fn_grade_rank(p_grade CHAR(1))
RETURNS TINYINT
DETERMINISTIC NO SQL
BEGIN
  RETURN CASE p_grade WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 END;
END$$

-- Great-circle distance between two lat/long points, in km
CREATE FUNCTION fn_distance_km(p_lat1 DECIMAL(9,6), p_lon1 DECIMAL(9,6),
                               p_lat2 DECIMAL(9,6), p_lon2 DECIMAL(9,6))
RETURNS DECIMAL(7,2)
DETERMINISTIC NO SQL
BEGIN
  RETURN ROUND(ST_Distance_Sphere(POINT(p_lon1, p_lat1), POINT(p_lon2, p_lat2)) / 1000, 2);
END$$

-- ---------------------------------------------------------------------------
-- Listings
-- ---------------------------------------------------------------------------

-- A new listing starts fully available; harvest cannot be in the future.
CREATE TRIGGER trg_listings_bi
BEFORE INSERT ON listings
FOR EACH ROW
BEGIN
  IF NEW.harvest_date > CURDATE() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Harvest date cannot be in the future';
  END IF;
  SET NEW.available_kg = NEW.quantity_kg;
END$$

-- Keep status in step with stock: 0 kg -> SOLD_OUT, restocked -> ACTIVE.
CREATE TRIGGER trg_listings_bu
BEFORE UPDATE ON listings
FOR EACH ROW
BEGIN
  IF NEW.available_kg = 0 AND NEW.status = 'ACTIVE' THEN
    SET NEW.status = 'SOLD_OUT';
  ELSEIF NEW.available_kg > 0 AND OLD.status = 'SOLD_OUT' AND NEW.status = 'SOLD_OUT' THEN
    SET NEW.status = 'ACTIVE';
  END IF;
END$$

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------

CREATE TRIGGER trg_orders_ai
AFTER INSERT ON orders
FOR EACH ROW
BEGIN
  INSERT INTO order_status_history (order_id, old_status, new_status)
  VALUES (NEW.order_id, NULL, NEW.status);
END$$

-- Allowed lifecycle:
--   PLACED -> CONFIRMED | CANCELLED
--   CONFIRMED -> SHIPPED | CANCELLED
--   SHIPPED -> DELIVERED
--   DELIVERED, CANCELLED are final
CREATE TRIGGER trg_orders_bu
BEFORE UPDATE ON orders
FOR EACH ROW
BEGIN
  IF NEW.status <> OLD.status AND NOT (
       (OLD.status = 'PLACED'    AND NEW.status IN ('CONFIRMED','CANCELLED'))
    OR (OLD.status = 'CONFIRMED' AND NEW.status IN ('SHIPPED','CANCELLED'))
    OR (OLD.status = 'SHIPPED'   AND NEW.status = 'DELIVERED')
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid order status transition';
  END IF;

  IF NEW.quantity_kg <> OLD.quantity_kg OR NEW.listing_id <> OLD.listing_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Order quantity and listing cannot be changed';
  END IF;
END$$

-- Audit every status change, track delivery, and give stock back on cancel.
CREATE TRIGGER trg_orders_au
AFTER UPDATE ON orders
FOR EACH ROW
BEGIN
  IF NEW.status <> OLD.status THEN
    INSERT INTO order_status_history (order_id, old_status, new_status)
    VALUES (NEW.order_id, OLD.status, NEW.status);
  END IF;

  IF NEW.status = 'SHIPPED' AND OLD.status <> 'SHIPPED' THEN
    INSERT INTO deliveries (order_id, pickup_date, expected_date)
    VALUES (NEW.order_id, CURDATE(), CURDATE() + INTERVAL 2 DAY)
    ON DUPLICATE KEY UPDATE pickup_date = CURDATE(), expected_date = CURDATE() + INTERVAL 2 DAY;
  END IF;

  IF NEW.status = 'DELIVERED' AND OLD.status <> 'DELIVERED' THEN
    UPDATE deliveries SET delivered_date = CURDATE() WHERE order_id = NEW.order_id;
  END IF;

  IF NEW.status = 'CANCELLED' AND OLD.status <> 'CANCELLED' THEN
    UPDATE listings
       SET available_kg = available_kg + NEW.quantity_kg
     WHERE listing_id = NEW.listing_id;

    IF NEW.requirement_id IS NOT NULL THEN
      UPDATE requirements
         SET fulfilled_kg = fulfilled_kg - NEW.quantity_kg,
             status = IF(status = 'FULFILLED', 'OPEN', status)
       WHERE requirement_id = NEW.requirement_id;
    END IF;
  END IF;
END$$

-- ---------------------------------------------------------------------------
-- Reviews: only a party to the order, only after delivery
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_reviews_bi
BEFORE INSERT ON reviews
FOR EACH ROW
BEGIN
  DECLARE v_status VARCHAR(20);
  DECLARE v_buyer  INT UNSIGNED;
  DECLARE v_farmer INT UNSIGNED;

  SELECT o.status, o.buyer_id, l.farmer_id
    INTO v_status, v_buyer, v_farmer
    FROM orders o JOIN listings l ON l.listing_id = o.listing_id
   WHERE o.order_id = NEW.order_id;

  IF v_status IS NULL OR v_status <> 'DELIVERED' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only delivered orders can be reviewed';
  END IF;
  IF NEW.reviewer_id NOT IN (v_buyer, v_farmer) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reviewer is not part of this order';
  END IF;
END$$

DELIMITER ;
