# AgriLink relational schema diagram (tables, PK/FK, FK -> PK arrows).
# Usage: python relational_schema.py  -> relational_schema.png / .svg
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, Rectangle

INK = "#1f2a1f"
HEAD = "#2E7D32"
PK_FILL = "#fff4d6"
FK_COLOR = "#1565c0"
ROW = 0.42
W = 6.2

# (name, x_left, y_top, [(column, type, flags)])  flags: P = primary key, F = foreign key, U = unique, G = generated
TABLES = [
    ("users", 12.8, 25.0, [
        ("user_id", "INT UNSIGNED", "P"), ("full_name", "VARCHAR(100)", ""), ("email", "VARCHAR(120)", "U"),
        ("phone", "VARCHAR(15)", "U"), ("password_hash", "VARCHAR(255)", ""), ("role", "ENUM(FARMER,BUYER,ADMIN)", ""),
        ("created_at", "TIMESTAMP", "")]),
    ("farmers", 1.5, 24.2, [
        ("farmer_id", "INT UNSIGNED", "PF"), ("farm_name", "VARCHAR(120)", ""), ("village", "VARCHAR(80)", ""),
        ("district", "VARCHAR(80)", ""), ("state", "VARCHAR(80)", ""), ("latitude", "DECIMAL(9,6)", ""),
        ("longitude", "DECIMAL(9,6)", ""), ("farm_size_acres", "DECIMAL(7,2)", "")]),
    ("buyers", 23.9, 24.2, [
        ("buyer_id", "INT UNSIGNED", "PF"), ("business_name", "VARCHAR(120)", ""), ("business_type", "ENUM(6 types)", ""),
        ("gstin", "CHAR(15)", "U"), ("district", "VARCHAR(80)", ""), ("state", "VARCHAR(80)", ""),
        ("latitude", "DECIMAL(9,6)", ""), ("longitude", "DECIMAL(9,6)", "")]),
    ("crops", 12.8, 19.6, [
        ("crop_id", "SMALLINT UNSIGNED", "P"), ("crop_name", "VARCHAR(60)", "U"), ("category", "ENUM(6 categories)", ""),
        ("shelf_life_days", "SMALLINT UNSIGNED", "")]),
    ("listings", 1.5, 18.6, [
        ("listing_id", "INT UNSIGNED", "P"), ("farmer_id", "INT UNSIGNED", "F"), ("crop_id", "SMALLINT UNSIGNED", "F"),
        ("variety", "VARCHAR(60)", ""), ("quantity_kg", "DECIMAL(10,2)", ""), ("available_kg", "DECIMAL(10,2)", ""),
        ("price_per_kg", "DECIMAL(8,2)", ""), ("quality_grade", "ENUM(A,B,C)", ""), ("is_organic", "BOOLEAN", ""),
        ("harvest_date", "DATE", ""), ("available_until", "DATE", ""), ("status", "ENUM(4 states)", ""),
        ("created_at", "TIMESTAMP", "")]),
    ("requirements", 23.9, 18.6, [
        ("requirement_id", "INT UNSIGNED", "P"), ("buyer_id", "INT UNSIGNED", "F"), ("crop_id", "SMALLINT UNSIGNED", "F"),
        ("quantity_kg", "DECIMAL(10,2)", ""), ("fulfilled_kg", "DECIMAL(10,2)", ""), ("max_price_per_kg", "DECIMAL(8,2)", ""),
        ("min_quality_grade", "ENUM(A,B,C)", ""), ("organic_only", "BOOLEAN", ""), ("max_distance_km", "SMALLINT UNSIGNED", ""),
        ("required_by", "DATE", ""), ("status", "ENUM(4 states)", ""), ("created_at", "TIMESTAMP", "")]),
    ("matches", 12.8, 15.9, [
        ("match_id", "INT UNSIGNED", "P"), ("requirement_id", "INT UNSIGNED", "FU"), ("listing_id", "INT UNSIGNED", "FU"),
        ("score", "DECIMAL(5,2)", ""), ("distance_km", "DECIMAL(7,2)", ""), ("status", "ENUM(3 states)", ""),
        ("matched_at", "TIMESTAMP", "")]),
    ("orders", 12.8, 11.4, [
        ("order_id", "INT UNSIGNED", "P"), ("buyer_id", "INT UNSIGNED", "F"), ("listing_id", "INT UNSIGNED", "F"),
        ("requirement_id", "INT UNSIGNED NULL", "F"), ("quantity_kg", "DECIMAL(10,2)", ""), ("price_per_kg", "DECIMAL(8,2)", ""),
        ("total_amount", "DECIMAL(12,2) STORED", "G"), ("status", "ENUM(5 states)", ""), ("placed_at", "TIMESTAMP", ""),
        ("updated_at", "TIMESTAMP", "")]),
    ("order_status_history", 1.5, 10.6, [
        ("history_id", "INT UNSIGNED", "P"), ("order_id", "INT UNSIGNED", "F"), ("old_status", "VARCHAR(20)", ""),
        ("new_status", "VARCHAR(20)", ""), ("changed_at", "TIMESTAMP", "")]),
    ("deliveries", 1.5, 6.4, [
        ("delivery_id", "INT UNSIGNED", "P"), ("order_id", "INT UNSIGNED", "FU"), ("vehicle_no", "VARCHAR(15)", ""),
        ("pickup_date", "DATE", ""), ("expected_date", "DATE", ""), ("delivered_date", "DATE", "")]),
    ("reviews", 23.9, 9.3, [
        ("review_id", "INT UNSIGNED", "P"), ("order_id", "INT UNSIGNED", "FU"), ("reviewer_id", "INT UNSIGNED", "FU"),
        ("rating", "TINYINT (1-5)", ""), ("comment", "VARCHAR(500)", ""), ("created_at", "TIMESTAMP", "")]),
]

# (from_table, column, to_table, column, lane_x, color)
FKS = [
    ("farmers", "farmer_id", "users", "user_id", 9.95, "#6a1b9a"),
    ("buyers", "buyer_id", "users", "user_id", 21.0, "#6a1b9a"),
    ("listings", "farmer_id", "farmers", "farmer_id", 0.7, "#2e7d32"),
    ("listings", "crop_id", "crops", "crop_id", 9.3, "#ef6c00"),
    ("requirements", "buyer_id", "buyers", "buyer_id", 30.65, "#00838f"),
    ("requirements", "crop_id", "crops", "crop_id", 21.6, "#ef6c00"),
    ("matches", "requirement_id", "requirements", "requirement_id", 22.2, "#ad1457"),
    ("matches", "listing_id", "listings", "listing_id", 8.6, "#5d4037"),
    ("orders", "buyer_id", "buyers", "buyer_id", 23.4, "#00838f"),
    ("orders", "listing_id", "listings", "listing_id", 8.0, "#5d4037"),
    ("orders", "requirement_id", "requirements", "requirement_id", 22.8, "#ad1457"),
    ("order_status_history", "order_id", "orders", "order_id", 10.6, "#1565c0"),
    ("deliveries", "order_id", "orders", "order_id", 11.25, "#1565c0"),
    ("reviews", "order_id", "orders", "order_id", 20.4, "#1565c0"),
    ("reviews", "reviewer_id", "users", "user_id", 31.25, "#6a1b9a"),
]

fig, ax = plt.subplots(figsize=(25, 21))
ax.set_xlim(0, 31.9)
ax.set_ylim(2.6, 27.2)
ax.set_aspect("equal")
ax.axis("off")

rows = {}  # (table, column) -> (left_x, right_x, y)
for name, x, y, cols in TABLES:
    h = ROW * (len(cols) + 1)
    ax.add_patch(Rectangle((x + 0.08, y - h - 0.08), W, h, fc="#d0d0d0", ec="none", zorder=2))  # shadow
    ax.add_patch(Rectangle((x, y - ROW), W, ROW, fc=HEAD, ec=INK, lw=1.4, zorder=4))
    ax.text(x + W / 2, y - ROW / 2, name, ha="center", va="center", color="white", fontsize=15, weight="bold", zorder=5)
    for i, (col, typ, flags) in enumerate(cols):
        ry = y - ROW * (i + 2)
        fill = PK_FILL if "P" in flags else "white"
        ax.add_patch(Rectangle((x, ry), W, ROW, fc=fill, ec="#9aa59a", lw=0.8, zorder=4))
        tag = " ".join(t for t, f in (("PK", "P"), ("FK", "F"), ("UQ", "U"), ("GEN", "G")) if f in flags)
        ax.text(x + 0.12, ry + ROW / 2, tag, va="center", fontsize=9.5, weight="bold",
                color="#b23b1e" if "P" in flags else FK_COLOR, zorder=5)
        style = {"weight": "bold"} if "P" in flags else {"style": "italic"} if "F" in flags else {}
        ax.text(x + 1.15, ry + ROW / 2, col, va="center", fontsize=12, color=FK_COLOR if "F" in flags and "P" not in flags else INK,
                zorder=5, **style)
        ax.text(x + W - 0.12, ry + ROW / 2, typ, va="center", ha="right", fontsize=9.5, color="#666666", zorder=5)
        if "P" in flags:
            ax.plot([x + 1.15, x + 1.15 + 0.105 * len(col)], [ry + 0.08, ry + 0.08], color=INK, lw=1, zorder=5)
        rows[(name, col)] = (x, x + W, ry + ROW / 2)
    ax.add_patch(Rectangle((x, y - h), W, h, fc="none", ec=INK, lw=1.6, zorder=6))

for src, scol, dst, dcol, lane, color in FKS:
    sl, sr, sy = rows[(src, scol)]
    dl, dr, dy = rows[(dst, dcol)]
    sx = sr if lane > sr else sl
    dx = dl if lane < dl else dr
    if dl <= lane <= dr or sl <= lane <= sr:
        raise ValueError(f"lane {lane} runs through a table for {src}.{scol}")
    ax.plot([sx, lane, lane], [sy, sy, dy], color=color, lw=1.8, zorder=3)
    ax.plot([sx], [sy], marker="o", color=color, ms=6, zorder=7)
    ax.add_patch(FancyArrowPatch((lane, dy), (dx, dy), arrowstyle="-|>", mutation_scale=22, color=color, lw=1.8, zorder=7))

ax.text(0.2, 26.75, "AgriLink – Relational Schema (MySQL 8, database agrilink)", fontsize=24, weight="bold", color=HEAD, va="center")
ax.text(0.2, 26.15, "PK = primary key (underlined) · FK = foreign key (blue italic, ● source → ▶ referenced key) · "
        "UQ = part of a UNIQUE constraint · GEN = generated column", fontsize=13, color="#555555", va="center")

for ext in ("png", "svg"):
    fig.savefig(f"relational_schema.{ext}", dpi=130, bbox_inches="tight", facecolor="white")
print("saved relational_schema.png / .svg")

