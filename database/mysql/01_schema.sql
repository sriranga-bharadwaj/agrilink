-- AgriLink: tables, constraints, indexes
USE agrilink;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS reviews, deliveries, order_status_history, orders,
                     matches, requirements, listings, crops, buyers, farmers, users;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------------
-- Users and roles (farmers / buyers are 1:1 specialisations of users)
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  user_id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(120) NOT NULL UNIQUE,
  phone         VARCHAR(15)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('FARMER','BUYER','ADMIN') NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_users_phone CHECK (phone REGEXP '^[0-9+]{10,15}$')
);

CREATE TABLE farmers (
  farmer_id        INT UNSIGNED PRIMARY KEY,
  farm_name        VARCHAR(120) NOT NULL,
  village          VARCHAR(80),
  district         VARCHAR(80)  NOT NULL,
  state            VARCHAR(80)  NOT NULL,
  latitude         DECIMAL(9,6) NOT NULL,
  longitude        DECIMAL(9,6) NOT NULL,
  farm_size_acres  DECIMAL(7,2),
  CONSTRAINT fk_farmers_user FOREIGN KEY (farmer_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT chk_farmers_lat CHECK (latitude  BETWEEN -90  AND 90),
  CONSTRAINT chk_farmers_lon CHECK (longitude BETWEEN -180 AND 180),
  CONSTRAINT chk_farmers_size CHECK (farm_size_acres IS NULL OR farm_size_acres > 0)
);

CREATE TABLE buyers (
  buyer_id       INT UNSIGNED PRIMARY KEY,
  business_name  VARCHAR(120) NOT NULL,
  business_type  ENUM('PROCESSOR','RESTAURANT','HOTEL','RETAILER','WHOLESALER','EXPORTER') NOT NULL,
  gstin          CHAR(15) UNIQUE,
  district       VARCHAR(80)  NOT NULL,
  state          VARCHAR(80)  NOT NULL,
  latitude       DECIMAL(9,6) NOT NULL,
  longitude      DECIMAL(9,6) NOT NULL,
  CONSTRAINT fk_buyers_user FOREIGN KEY (buyer_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT chk_buyers_lat CHECK (latitude  BETWEEN -90  AND 90),
  CONSTRAINT chk_buyers_lon CHECK (longitude BETWEEN -180 AND 180)
);

-- ---------------------------------------------------------------------------
-- Crop catalogue
-- ---------------------------------------------------------------------------
CREATE TABLE crops (
  crop_id          SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  crop_name        VARCHAR(60) NOT NULL UNIQUE,
  category         ENUM('GRAIN','PULSE','VEGETABLE','FRUIT','SPICE','OILSEED') NOT NULL,
  shelf_life_days  SMALLINT UNSIGNED NOT NULL,
  CONSTRAINT chk_crops_shelf CHECK (shelf_life_days > 0)
);

-- ---------------------------------------------------------------------------
-- Supply: produce listed by farmers
-- Crop-specific quality details (moisture, Brix, ripeness...) live in MongoDB,
-- keyed by listing_id. SQL keeps the common, comparable grade.
-- ---------------------------------------------------------------------------
CREATE TABLE listings (
  listing_id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  farmer_id        INT UNSIGNED NOT NULL,
  crop_id          SMALLINT UNSIGNED NOT NULL,
  variety          VARCHAR(60),
  quantity_kg      DECIMAL(10,2) NOT NULL,
  available_kg     DECIMAL(10,2) NOT NULL DEFAULT 0,  -- set from quantity_kg by trigger
  price_per_kg     DECIMAL(8,2)  NOT NULL,
  quality_grade    ENUM('A','B','C') NOT NULL,
  is_organic       BOOLEAN NOT NULL DEFAULT FALSE,
  harvest_date     DATE NOT NULL,
  available_until  DATE NOT NULL,
  status           ENUM('ACTIVE','SOLD_OUT','EXPIRED','WITHDRAWN') NOT NULL DEFAULT 'ACTIVE',
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_listings_farmer FOREIGN KEY (farmer_id) REFERENCES farmers(farmer_id),
  CONSTRAINT fk_listings_crop   FOREIGN KEY (crop_id)   REFERENCES crops(crop_id),
  CONSTRAINT chk_listings_qty   CHECK (quantity_kg > 0),
  CONSTRAINT chk_listings_avail CHECK (available_kg >= 0 AND available_kg <= quantity_kg),
  CONSTRAINT chk_listings_price CHECK (price_per_kg > 0),
  CONSTRAINT chk_listings_dates CHECK (available_until >= harvest_date)
);
CREATE INDEX idx_listings_match ON listings (crop_id, status, price_per_kg);
CREATE INDEX idx_listings_farmer ON listings (farmer_id, status);

-- ---------------------------------------------------------------------------
-- Demand: procurement requirements posted by buyers
-- ---------------------------------------------------------------------------
CREATE TABLE requirements (
  requirement_id     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  buyer_id           INT UNSIGNED NOT NULL,
  crop_id            SMALLINT UNSIGNED NOT NULL,
  quantity_kg        DECIMAL(10,2) NOT NULL,
  fulfilled_kg       DECIMAL(10,2) NOT NULL DEFAULT 0,
  max_price_per_kg   DECIMAL(8,2)  NOT NULL,
  min_quality_grade  ENUM('A','B','C') NOT NULL DEFAULT 'C',
  organic_only       BOOLEAN NOT NULL DEFAULT FALSE,
  max_distance_km    SMALLINT UNSIGNED NOT NULL DEFAULT 300,
  required_by        DATE NOT NULL,
  status             ENUM('OPEN','FULFILLED','CANCELLED','EXPIRED') NOT NULL DEFAULT 'OPEN',
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_req_buyer FOREIGN KEY (buyer_id) REFERENCES buyers(buyer_id),
  CONSTRAINT fk_req_crop  FOREIGN KEY (crop_id)  REFERENCES crops(crop_id),
  CONSTRAINT chk_req_qty  CHECK (quantity_kg > 0),
  CONSTRAINT chk_req_fill CHECK (fulfilled_kg >= 0 AND fulfilled_kg <= quantity_kg),
  CONSTRAINT chk_req_price CHECK (max_price_per_kg > 0),
  CONSTRAINT chk_req_dist  CHECK (max_distance_km > 0)
);
CREATE INDEX idx_req_open ON requirements (crop_id, status);

-- ---------------------------------------------------------------------------
-- Matching results (written by sp_find_matches)
-- ---------------------------------------------------------------------------
CREATE TABLE matches (
  match_id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  requirement_id  INT UNSIGNED NOT NULL,
  listing_id      INT UNSIGNED NOT NULL,
  score           DECIMAL(5,2) NOT NULL,
  distance_km     DECIMAL(7,2) NOT NULL,
  status          ENUM('SUGGESTED','ACCEPTED','REJECTED') NOT NULL DEFAULT 'SUGGESTED',
  matched_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_match_req     FOREIGN KEY (requirement_id) REFERENCES requirements(requirement_id) ON DELETE CASCADE,
  CONSTRAINT fk_match_listing FOREIGN KEY (listing_id)     REFERENCES listings(listing_id)         ON DELETE CASCADE,
  CONSTRAINT uq_match UNIQUE (requirement_id, listing_id),
  CONSTRAINT chk_match_score CHECK (score BETWEEN 0 AND 100)
);

-- ---------------------------------------------------------------------------
-- Orders, audit trail, delivery, reviews
-- ---------------------------------------------------------------------------
CREATE TABLE orders (
  order_id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  buyer_id        INT UNSIGNED NOT NULL,
  listing_id      INT UNSIGNED NOT NULL,
  requirement_id  INT UNSIGNED NULL,
  quantity_kg     DECIMAL(10,2) NOT NULL,
  price_per_kg    DECIMAL(8,2)  NOT NULL,
  total_amount    DECIMAL(12,2) AS (quantity_kg * price_per_kg) STORED,
  status          ENUM('PLACED','CONFIRMED','SHIPPED','DELIVERED','CANCELLED') NOT NULL DEFAULT 'PLACED',
  placed_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_buyer   FOREIGN KEY (buyer_id)       REFERENCES buyers(buyer_id),
  CONSTRAINT fk_orders_listing FOREIGN KEY (listing_id)     REFERENCES listings(listing_id),
  CONSTRAINT fk_orders_req     FOREIGN KEY (requirement_id) REFERENCES requirements(requirement_id),
  CONSTRAINT chk_orders_qty    CHECK (quantity_kg > 0),
  CONSTRAINT chk_orders_price  CHECK (price_per_kg > 0)
);
CREATE INDEX idx_orders_buyer ON orders (buyer_id, status);
CREATE INDEX idx_orders_listing ON orders (listing_id);

CREATE TABLE order_status_history (
  history_id   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id     INT UNSIGNED NOT NULL,
  old_status   VARCHAR(20),
  new_status   VARCHAR(20) NOT NULL,
  changed_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_hist_order FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
);

CREATE TABLE deliveries (
  delivery_id     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id        INT UNSIGNED NOT NULL UNIQUE,
  vehicle_no      VARCHAR(15),
  pickup_date     DATE,
  expected_date   DATE,
  delivered_date  DATE,
  CONSTRAINT fk_deliv_order FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
  CONSTRAINT chk_deliv_dates CHECK (expected_date IS NULL OR pickup_date IS NULL OR expected_date >= pickup_date)
);

CREATE TABLE reviews (
  review_id    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id     INT UNSIGNED NOT NULL,
  reviewer_id  INT UNSIGNED NOT NULL,
  rating       TINYINT UNSIGNED NOT NULL,
  comment      VARCHAR(500),
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_review_order FOREIGN KEY (order_id)    REFERENCES orders(order_id) ON DELETE CASCADE,
  CONSTRAINT fk_review_user  FOREIGN KEY (reviewer_id) REFERENCES users(user_id),
  CONSTRAINT uq_review UNIQUE (order_id, reviewer_id),  -- buyer and farmer may each review once
  CONSTRAINT chk_review_rating CHECK (rating BETWEEN 1 AND 5)
);
