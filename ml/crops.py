"""AgriLink crop -> Agmarknet commodity names (as they appear in the data.gov.in variety-wise dataset)."""

CROPS = {
    "Tomato": ["Tomato"],
    "Onion": ["Onion"],
    "Potato": ["Potato"],
    "Rice": ["Rice"],  # milled rice; Paddy(Dhan) is unmilled and priced differently
    "Ragi": ["Ragi (Finger Millet)"],
    "Banana": ["Banana", "Banana - Green"],
    "Grapes": ["Grapes"],
    "Toor Dal": ["Arhar (Tur/Red Gram)(Whole)", "Arhar Dal(Tur Dal)"],
    "Turmeric": ["Turmeric", "Turmeric (raw)"],
    "Groundnut": ["Groundnut", "Groundnut pods (raw)"],
}

COMMODITY_TO_CROP = {c: crop for crop, names in CROPS.items() for c in names}

# Districts of the seeded AgriLink farmers and buyers (database/mysql/05_seed.sql).
FARMER_DISTRICTS = ["Kolar", "Chikkaballapur", "Belagavi", "Mandya", "Hassan", "Nashik"]
BUYER_DISTRICTS = ["Bengaluru", "Bengaluru Urban", "Bangalore", "Mysuru", "Mysore", "Tumakuru", "Tumkur"]
