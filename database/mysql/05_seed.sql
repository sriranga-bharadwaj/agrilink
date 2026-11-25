-- AgriLink: sample data (dates are relative to today so the demo stays fresh)
-- Every demo user's password is "password123" (bcrypt hash below).
USE agrilink;

SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE reviews;
TRUNCATE TABLE deliveries;
TRUNCATE TABLE order_status_history;
TRUNCATE TABLE orders;
TRUNCATE TABLE matches;
TRUNCATE TABLE requirements;
TRUNCATE TABLE listings;
TRUNCATE TABLE crops;
TRUNCATE TABLE buyers;
TRUNCATE TABLE farmers;
TRUNCATE TABLE users;
SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO users (user_id, full_name, email, phone, password_hash, role) VALUES
 (1,  'Ramesh Gowda',    'ramesh@agrilink.test',    '9845000001', '$2b$10$eQqjhvvvOqU7OuoR2.Ceb.tnlU3BKTs4aeHDhvJT323G3YW./FKES', 'FARMER'),
 (2,  'Lakshmi Devi',    'lakshmi@agrilink.test',   '9845000002', '$2b$10$eQqjhvvvOqU7OuoR2.Ceb.tnlU3BKTs4aeHDhvJT323G3YW./FKES', 'FARMER'),
 (3,  'Suresh Patil',    'suresh@agrilink.test',    '9845000003', '$2b$10$eQqjhvvvOqU7OuoR2.Ceb.tnlU3BKTs4aeHDhvJT323G3YW./FKES', 'FARMER'),
 (4,  'Manjunath K',     'manjunath@agrilink.test', '9845000004', '$2b$10$eQqjhvvvOqU7OuoR2.Ceb.tnlU3BKTs4aeHDhvJT323G3YW./FKES', 'FARMER'),
 (5,  'Kavitha R',       'kavitha@agrilink.test',   '9845000005', '$2b$10$eQqjhvvvOqU7OuoR2.Ceb.tnlU3BKTs4aeHDhvJT323G3YW./FKES', 'FARMER'),
 (6,  'Prakash Shinde',  'prakash@agrilink.test',   '9845000006', '$2b$10$eQqjhvvvOqU7OuoR2.Ceb.tnlU3BKTs4aeHDhvJT323G3YW./FKES', 'FARMER'),
 (7,  'Anil Mehta',      'procure@freshbite.test',  '9845000007', '$2b$10$eQqjhvvvOqU7OuoR2.Ceb.tnlU3BKTs4aeHDhvJT323G3YW./FKES', 'BUYER'),
 (8,  'Divya Rao',       'kitchen@kaverigrand.test','9845000008', '$2b$10$eQqjhvvvOqU7OuoR2.Ceb.tnlU3BKTs4aeHDhvJT323G3YW./FKES', 'BUYER'),
 (9,  'Farhan Ali',      'buying@greenbasket.test', '9845000009', '$2b$10$eQqjhvvvOqU7OuoR2.Ceb.tnlU3BKTs4aeHDhvJT323G3YW./FKES', 'BUYER'),
 (10, 'Sneha Iyer',      'trade@deccanagro.test',   '9845000010', '$2b$10$eQqjhvvvOqU7OuoR2.Ceb.tnlU3BKTs4aeHDhvJT323G3YW./FKES', 'BUYER'),
 (11, 'Platform Admin',  'admin@agrilink.test',     '9845000011', '$2b$10$eQqjhvvvOqU7OuoR2.Ceb.tnlU3BKTs4aeHDhvJT323G3YW./FKES', 'ADMIN');

INSERT INTO farmers (farmer_id, farm_name, village, district, state, latitude, longitude, farm_size_acres) VALUES
 (1, 'Gowda Tomato Farm',     'Vemagal',     'Kolar',          'Karnataka',   13.136700, 78.129200,  6.5),
 (2, 'Lakshmi Organic Fields','Nandi',       'Chikkaballapur', 'Karnataka',   13.435500, 77.731500,  4.0),
 (3, 'Patil Agro',            'Hukkeri',     'Belagavi',       'Karnataka',   15.849700, 74.497700, 12.0),
 (4, 'Cauvery Paddy Fields',  'Maddur',      'Mandya',         'Karnataka',   12.521800, 76.895100,  9.0),
 (5, 'Malnad Greens',         'Belur',       'Hassan',         'Karnataka',   13.007200, 76.096200,  7.5),
 (6, 'Shinde Onion Growers',  'Lasalgaon',   'Nashik',         'Maharashtra', 19.997500, 73.789800, 15.0);

INSERT INTO buyers (buyer_id, business_name, business_type, gstin, district, state, latitude, longitude) VALUES
 (7,  'FreshBite Foods Pvt Ltd', 'PROCESSOR', '29AAACF1111A1Z1', 'Bengaluru Urban', 'Karnataka', 12.971600, 77.594600),
 (8,  'Hotel Kaveri Grand',      'HOTEL',     '29AAACK2222B1Z2', 'Mysuru',          'Karnataka', 12.295800, 76.639400),
 (9,  'GreenBasket Retail',      'RETAILER',  '29AAACG3333C1Z3', 'Bengaluru Urban', 'Karnataka', 12.935200, 77.624500),
 (10, 'Deccan Agro Exports',     'EXPORTER',  '29AAACD4444D1Z4', 'Tumakuru',        'Karnataka', 13.340900, 77.101000);

INSERT INTO crops (crop_id, crop_name, category, shelf_life_days) VALUES
 (1,  'Tomato',   'VEGETABLE', 10),
 (2,  'Onion',    'VEGETABLE', 60),
 (3,  'Potato',   'VEGETABLE', 45),
 (4,  'Rice',     'GRAIN',    365),
 (5,  'Ragi',     'GRAIN',    180),
 (6,  'Banana',   'FRUIT',      7),
 (7,  'Grapes',   'FRUIT',     10),
 (8,  'Toor Dal', 'PULSE',    365),
 (9,  'Turmeric', 'SPICE',    365),
 (10, 'Groundnut','OILSEED',  120);

-- available_kg is filled from quantity_kg by trg_listings_bi
INSERT INTO listings (listing_id, farmer_id, crop_id, variety, quantity_kg, price_per_kg,
                      quality_grade, is_organic, harvest_date, available_until) VALUES
 (1,  1, 1, 'Arka Rakshak',     2000, 18.00, 'A', FALSE, CURDATE() - INTERVAL 1 DAY,  CURDATE() + INTERVAL 7 DAY),
 (2,  1, 1, 'Local Desi',       1500, 14.00, 'B', FALSE, CURDATE() - INTERVAL 3 DAY,  CURDATE() + INTERVAL 4 DAY),
 (3,  2, 1, 'Arka Samrat',       800, 22.00, 'A', TRUE,  CURDATE() - INTERVAL 1 DAY,  CURDATE() + INTERVAL 6 DAY),
 (4,  2, 2, 'Bellary Red',      5000, 25.00, 'B', FALSE, CURDATE() - INTERVAL 10 DAY, CURDATE() + INTERVAL 40 DAY),
 (5,  6, 2, 'Nashik Red',      10000, 21.00, 'A', FALSE, CURDATE() - INTERVAL 7 DAY,  CURDATE() + INTERVAL 45 DAY),
 (6,  3, 3, 'Kufri Jyoti',      4000, 20.00, 'B', FALSE, CURDATE() - INTERVAL 5 DAY,  CURDATE() + INTERVAL 30 DAY),
 (7,  5, 3, 'Kufri Chipsona',   6000, 23.00, 'A', FALSE, CURDATE() - INTERVAL 4 DAY,  CURDATE() + INTERVAL 30 DAY),
 (8,  4, 4, 'Sona Masuri',      8000, 48.00, 'A', FALSE, CURDATE() - INTERVAL 20 DAY, CURDATE() + INTERVAL 200 DAY),
 (9,  4, 5, 'GPU-28',           3000, 38.00, 'A', TRUE,  CURDATE() - INTERVAL 15 DAY, CURDATE() + INTERVAL 150 DAY),
 (10, 5, 6, 'Yelakki',          1200, 45.00, 'A', TRUE,  CURDATE() - INTERVAL 1 DAY,  CURDATE() + INTERVAL 5 DAY),
 (11, 2, 7, 'Sharad Seedless',  1000, 70.00, 'A', FALSE, CURDATE() - INTERVAL 2 DAY,  CURDATE() + INTERVAL 7 DAY),
 (12, 3, 9, 'Salem',            1500,120.00, 'B', FALSE, CURDATE() - INTERVAL 30 DAY, CURDATE() + INTERVAL 300 DAY),
 (13, 1, 1, 'Arka Rakshak',      600, 12.00, 'C', FALSE, CURDATE() - INTERVAL 15 DAY, CURDATE() - INTERVAL 2 DAY),  -- stale, expires on sp_expire_stale
 (14, 4, 8, 'BSMR-736',         2500,105.00, 'A', FALSE, CURDATE() - INTERVAL 25 DAY, CURDATE() + INTERVAL 300 DAY);

INSERT INTO requirements (requirement_id, buyer_id, crop_id, quantity_kg, max_price_per_kg,
                          min_quality_grade, organic_only, max_distance_km, required_by) VALUES
 (1, 7,  1, 2500, 20.00, 'B', FALSE, 150, CURDATE() + INTERVAL 5 DAY),   -- tomato for sauce line
 (2, 8,  1,  300, 25.00, 'A', TRUE,  200, CURDATE() + INTERVAL 3 DAY),   -- organic tomato for hotel kitchen
 (3, 9,  2, 3000, 26.00, 'B', FALSE, 300, CURDATE() + INTERVAL 10 DAY),  -- onion for retail
 (4, 7,  3, 5000, 24.00, 'A', FALSE, 400, CURDATE() + INTERVAL 7 DAY),   -- chip-grade potato
 (5, 10, 4, 6000, 50.00, 'A', FALSE, 300, CURDATE() + INTERVAL 20 DAY),  -- rice for export
 (6, 10, 5, 2000, 40.00, 'A', TRUE,  300, CURDATE() + INTERVAL 30 DAY);  -- organic ragi

-- A bit of history so the dashboards have data: rice order delivered and reviewed,
-- onion order confirmed.
CALL sp_find_matches(5);
CALL sp_place_order(10, 8, 5, 2000, @rice_order);
UPDATE orders SET status = 'CONFIRMED' WHERE order_id = @rice_order;
UPDATE orders SET status = 'SHIPPED'   WHERE order_id = @rice_order;
UPDATE orders SET status = 'DELIVERED' WHERE order_id = @rice_order;
INSERT INTO reviews (order_id, reviewer_id, rating, comment)
VALUES (@rice_order, 10, 5, 'Clean grain, moisture within spec, delivered on time.');

CALL sp_find_matches(3);
CALL sp_place_order(9, 4, 3, 1000, @onion_order);
UPDATE orders SET status = 'CONFIRMED' WHERE order_id = @onion_order;
