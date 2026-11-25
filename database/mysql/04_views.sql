-- AgriLink: reporting views
USE agrilink;

-- Marketplace feed: what can be bought right now, with freshness
CREATE OR REPLACE VIEW v_active_listings AS
SELECT l.listing_id,
       f.farmer_id, f.farm_name, f.district, f.state,
       c.crop_name, c.category, l.variety,
       l.available_kg, l.price_per_kg, l.quality_grade, l.is_organic,
       l.harvest_date,
       DATEDIFF(CURDATE(), l.harvest_date) AS days_since_harvest,
       ROUND(100 * GREATEST(0, 1 - DATEDIFF(CURDATE(), l.harvest_date) / c.shelf_life_days), 1) AS freshness_pct,
       l.available_until
  FROM listings l
  JOIN farmers f ON f.farmer_id = l.farmer_id
  JOIN crops   c ON c.crop_id   = l.crop_id
 WHERE l.status = 'ACTIVE'
   AND l.available_until >= CURDATE();

-- Demand board: open buyer requirements and what is still needed
CREATE OR REPLACE VIEW v_open_requirements AS
SELECT r.requirement_id,
       b.buyer_id, b.business_name, b.business_type, b.district,
       c.crop_name,
       r.quantity_kg, r.fulfilled_kg, r.quantity_kg - r.fulfilled_kg AS remaining_kg,
       r.max_price_per_kg, r.min_quality_grade, r.organic_only, r.max_distance_km,
       r.required_by, DATEDIFF(r.required_by, CURDATE()) AS days_left
  FROM requirements r
  JOIN buyers b ON b.buyer_id = r.buyer_id
  JOIN crops  c ON c.crop_id  = r.crop_id
 WHERE r.status = 'OPEN';

-- Farmer dashboard: sales and earnings (cancelled orders excluded)
CREATE OR REPLACE VIEW v_farmer_earnings AS
SELECT f.farmer_id, u.full_name, f.farm_name, f.district,
       COUNT(o.order_id)                                                AS orders,
       COALESCE(SUM(o.quantity_kg), 0)                                  AS kg_sold,
       COALESCE(SUM(CASE WHEN o.status = 'DELIVERED' THEN o.total_amount END), 0) AS earned,
       COALESCE(SUM(CASE WHEN o.status <> 'DELIVERED' THEN o.total_amount END), 0) AS pending,
       (SELECT ROUND(AVG(rv.rating), 2)
          FROM reviews rv
          JOIN orders o2   ON o2.order_id = rv.order_id
          JOIN listings l2 ON l2.listing_id = o2.listing_id
         WHERE l2.farmer_id = f.farmer_id
           AND rv.reviewer_id = o2.buyer_id)                            AS avg_rating
  FROM farmers f
  JOIN users u ON u.user_id = f.farmer_id
  LEFT JOIN listings l ON l.farmer_id = f.farmer_id
  LEFT JOIN orders   o ON o.listing_id = l.listing_id AND o.status <> 'CANCELLED'
 GROUP BY f.farmer_id, u.full_name, f.farm_name, f.district;

-- Buyer dashboard: procurement spend
CREATE OR REPLACE VIEW v_buyer_spend AS
SELECT b.buyer_id, b.business_name, b.business_type,
       COUNT(o.order_id)                 AS orders,
       COALESCE(SUM(o.quantity_kg), 0)   AS kg_bought,
       COALESCE(SUM(o.total_amount), 0)  AS total_spend,
       ROUND(COALESCE(SUM(o.total_amount) / NULLIF(SUM(o.quantity_kg), 0), 0), 2) AS avg_price_per_kg
  FROM buyers b
  LEFT JOIN orders o ON o.buyer_id = b.buyer_id AND o.status <> 'CANCELLED'
 GROUP BY b.buyer_id, b.business_name, b.business_type;

-- Market overview per crop: supply vs. demand and price range
CREATE OR REPLACE VIEW v_crop_market_summary AS
SELECT c.crop_id, c.crop_name, c.category,
       COALESCE(s.listings, 0)      AS active_listings,
       COALESCE(s.supply_kg, 0)     AS supply_kg,
       s.min_price, s.avg_price, s.max_price,
       COALESCE(d.requirements, 0)  AS open_requirements,
       COALESCE(d.demand_kg, 0)     AS demand_kg,
       ROUND(COALESCE(d.demand_kg, 0) / NULLIF(s.supply_kg, 0), 2) AS demand_supply_ratio
  FROM crops c
  LEFT JOIN (SELECT crop_id, COUNT(*) AS listings, SUM(available_kg) AS supply_kg,
                    MIN(price_per_kg) AS min_price, ROUND(AVG(price_per_kg), 2) AS avg_price,
                    MAX(price_per_kg) AS max_price
               FROM listings
              WHERE status = 'ACTIVE' AND available_until >= CURDATE()
              GROUP BY crop_id) s ON s.crop_id = c.crop_id
  LEFT JOIN (SELECT crop_id, COUNT(*) AS requirements,
                    SUM(quantity_kg - fulfilled_kg) AS demand_kg
               FROM requirements
              WHERE status = 'OPEN'
              GROUP BY crop_id) d ON d.crop_id = c.crop_id;

-- Full order details for both sides
CREATE OR REPLACE VIEW v_order_details AS
SELECT o.order_id, o.status, o.placed_at,
       o.buyer_id, l.farmer_id,
       b.business_name AS buyer, f.farm_name AS farmer,
       c.crop_name, l.variety, o.quantity_kg, o.price_per_kg, o.total_amount,
       o.requirement_id, d.expected_date, d.delivered_date
  FROM orders o
  JOIN buyers   b ON b.buyer_id   = o.buyer_id
  JOIN listings l ON l.listing_id = o.listing_id
  JOIN farmers  f ON f.farmer_id  = l.farmer_id
  JOIN crops    c ON c.crop_id    = l.crop_id
  LEFT JOIN deliveries d ON d.order_id = o.order_id;
