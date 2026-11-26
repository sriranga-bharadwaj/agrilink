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

# Rows that share a crop but are different products, priced differently; they never share a series.
PRODUCT_BY_COMMODITY = {
    "Arhar (Tur/Red Gram)(Whole)": "Toor (whole)",
    "Arhar Dal(Tur Dal)": "Toor dal",
    "Groundnut": "Groundnut",
    "Groundnut pods (raw)": "Groundnut pods",
}
PRODUCT_BY_VARIETY = {("Rice", "broken rice"): "Broken rice"}


def product(crop: str, commodity: str, variety: str) -> str:
    return (PRODUCT_BY_VARIETY.get((crop, str(variety).strip().lower()))
            or PRODUCT_BY_COMMODITY.get(commodity)
            or crop)

# Districts of the seeded AgriLink farmers and buyers (database/mysql/05_seed.sql).
FARMER_DISTRICTS = ["Kolar", "Chikkaballapur", "Belagavi", "Mandya", "Hassan", "Nashik"]
BUYER_DISTRICTS = ["Bengaluru", "Bengaluru Urban", "Bangalore", "Mysuru", "Mysore", "Tumakuru", "Tumkur"]
