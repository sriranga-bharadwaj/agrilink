# AgriLink ER diagram (Chen notation). Usage: python er_diagram.py  -> er_diagram.png / .svg
import math

import matplotlib.pyplot as plt
from matplotlib.patches import Ellipse, Polygon, Rectangle

INK = "#1f2a1f"
ENT = "#e3f1e4"
REL = "#fff4d6"
ATT = "#ffffff"

fig, ax = plt.subplots(figsize=(31.5, 23))
ax.set_xlim(-0.5, 31)
ax.set_ylim(-0.3, 22.7)
ax.set_aspect("equal")
ax.axis("off")
pos = {}


def line(a, b, total=False, z=1):
    """Connect two named shapes (or points). total=True draws a double line."""
    pts = [pos[p] if isinstance(p, str) else p for p in (a, b)]
    xs, ys = zip(*pts)
    if total:
        ax.plot(xs, ys, color=INK, lw=5.5, zorder=z, solid_capstyle="butt")
        ax.plot(xs, ys, color="white", lw=2.2, zorder=z, solid_capstyle="butt")
    else:
        ax.plot(xs, ys, color=INK, lw=1.4, zorder=z)


def path(points, total=False):
    for a, b in zip(points, points[1:]):
        line(a, b, total)


def entity(name, x, y, weak=False):
    pos[name] = (x, y)
    w, h = 0.24 * len(name) + 1.0, 0.95
    ax.add_patch(Rectangle((x - w / 2, y - h / 2), w, h, fc=ENT, ec=INK, lw=2, zorder=5))
    if weak:
        ax.add_patch(Rectangle((x - w / 2 + 0.12, y - h / 2 + 0.12), w - 0.24, h - 0.24, fc="none", ec=INK, lw=1.4, zorder=6))
    ax.text(x, y, name, ha="center", va="center", fontsize=19, weight="bold", zorder=7)


def relation(name, x, y, identifying=False):
    pos[name] = (x, y)
    w, h = max(2.3, 0.2 * len(name) + 1.3), 1.15
    diamond = [(x - w / 2, y), (x, y + h / 2), (x + w / 2, y), (x, y - h / 2)]
    ax.add_patch(Polygon(diamond, fc=REL, ec=INK, lw=2, zorder=5))
    if identifying:
        s = 0.8
        inner = [(x - w / 2 * s, y), (x, y + h / 2 * s), (x + w / 2 * s, y), (x, y - h / 2 * s)]
        ax.add_patch(Polygon(inner, fc="none", ec=INK, lw=1.3, zorder=6))
    ax.text(x, y, name, ha="center", va="center", fontsize=13.5, weight="bold", zorder=7)


def attr(owner, name, x, y, key=False, partial=False, derived=False, total=False):
    """Oval attribute linked to owner. key: underlined, partial: dashed underline."""
    w, h = 0.135 * len(name) + 0.55, 0.62
    line(owner, (x, y), total)
    ax.add_patch(Ellipse((x, y), w, h, fc=ATT, ec=INK, lw=1.4, zorder=5, ls="--" if derived else "-"))
    ax.text(x, y + 0.02, name, ha="center", va="center", fontsize=13, zorder=7)
    if key or partial:
        half = 0.0545 * len(name)
        ax.plot([x - half, x + half], [y - 0.17, y - 0.17], color=INK, lw=1.3, zorder=7, ls="--" if partial else "-")
    pos[f"{owner}.{name}"] = (x, y)


def card(text, x, y):
    ax.text(x, y, text, fontsize=17, weight="bold", color="#b23b1e", ha="center", va="center", zorder=8)


# ---------------- entities and specialisation ----------------
entity("USER", 15, 20.2)
for n, x, y, k in [("user_id", 10.8, 20.95, True), ("full_name", 12.6, 21.75, False), ("email", 15, 22.05, False),
                   ("phone", 17.4, 21.75, False), ("password_hash", 19.5, 20.95, False), ("role", 19.9, 19.85, False)]:
    attr("USER", n, x, y, key=k)

# ISA triangle (disjoint, partial: ADMIN users are neither)
tri = [(15, 18.95), (14.25, 17.75), (15.75, 17.75)]
pos["ISA"] = (15, 18.2)
line("USER", (15, 18.95))
ax.add_patch(Polygon(tri, fc="white", ec=INK, lw=2, zorder=5))
ax.text(15, 18.2, "ISA", ha="center", va="center", fontsize=12, weight="bold", zorder=7)
ax.text(15.95, 18.75, "d", fontsize=16, style="italic", zorder=7)

entity("FARMER", 7, 16.8)
entity("BUYER", 23, 16.8)
line((14.5, 17.85), "FARMER", total=True)
line((15.5, 17.85), "BUYER", total=True)

for n, x, y in [("farm_name", 4.0, 18.55), ("village", 6.6, 18.95), ("district", 2.4, 17.7), ("farm_size_acres", 2.7, 16.7)]:
    attr("FARMER", n, x, y)
attr("FARMER", "location", 4.3, 15.45)
attr("FARMER.location", "latitude", 2.5, 14.55)
attr("FARMER.location", "longitude", 4.5, 14.25)

for n, x, y in [("business_name", 26.0, 18.55), ("business_type", 23.4, 18.95), ("gstin", 27.9, 17.55), ("district", 27.7, 16.15)]:
    attr("BUYER", n, x, y, key=(n == "gstin"))
attr("BUYER", "location", 25.7, 15.45)
attr("BUYER.location", "latitude", 27.6, 14.5)
attr("BUYER.location", "longitude", 25.4, 14.25)

# ---------------- supply / demand ----------------
relation("POSTS", 7, 14)
relation("RAISES", 23, 14)
entity("LISTING", 7, 11)
entity("REQUIREMENT", 23, 11)
line("FARMER", "POSTS"); line("POSTS", "LISTING", total=True)
line("BUYER", "RAISES"); line("RAISES", "REQUIREMENT", total=True)
card("1", 7.35, 15.85); card("N", 7.35, 12.05)
card("1", 23.35, 15.85); card("N", 23.35, 12.05)

listing_attrs = ["listing_id", "variety", "quantity_kg", "available_kg", "price_per_kg",
                 "quality_grade", "is_organic", "harvest_date", "available_until", "status"]
def fan(owner, names, start, end, rx, ry, key):
    """Spread attributes on an elliptical arc around owner so their lines never cross."""
    cx, cy = pos[owner]
    for i, n in enumerate(names):
        a = math.radians(start + (end - start) * i / (len(names) - 1))
        attr(owner, n, cx + rx * math.cos(a), cy + ry * math.sin(a), key=(n == key))


fan("LISTING", listing_attrs[:8], 120, 246, 4.5, 2.75, "listing_id")
attr("LISTING", "available_until", 10.4, 12.5)
attr("LISTING", "status", 8.9, 12.9)
req_attrs = ["requirement_id", "quantity_kg", "fulfilled_kg", "max_price_per_kg", "min_quality_grade",
             "organic_only", "max_distance_km"]
fan("REQUIREMENT", req_attrs, 58, -58, 4.4, 2.75, "requirement_id")
attr("REQUIREMENT", "required_by", 19.75, 12.5)
attr("REQUIREMENT", "status", 21.1, 12.9)

relation("MATCHES", 15, 11)
line("LISTING", "MATCHES"); line("MATCHES", "REQUIREMENT")
card("M", 9.1, 11.35); card("N", 20.6, 11.35)
for n, x, y in [("score", 12.7, 12.45), ("distance_km", 14.2, 13.0), ("status", 15.9, 13.0), ("matched_at", 17.4, 12.45)]:
    attr("MATCHES", n, x, y)

# ---------------- crop catalogue ----------------
entity("CROP", 15, 7.6)
relation("OF_CROP", 10.9, 9.05)
relation("FOR_CROP", 19.1, 9.05)
line("LISTING", "OF_CROP", total=True); line("OF_CROP", "CROP")
line("REQUIREMENT", "FOR_CROP", total=True); line("FOR_CROP", "CROP")
card("N", 8.9, 10.35); card("1", 13.4, 8.45)
card("N", 21.1, 10.35); card("1", 16.6, 8.45)
for n, x, y in [("crop_id", 12.6, 6.5), ("crop_name", 14.2, 6.1), ("category", 15.9, 6.1), ("shelf_life_days", 17.8, 6.5)]:
    attr("CROP", n, x, y, key=(n == "crop_id"))

# ---------------- orders ----------------
entity("ORDER", 15, 3.6)
relation("CONTAINS", 8.5, 5.65)
relation("FULFILS", 21.5, 5.65)
line("LISTING", "CONTAINS"); line("CONTAINS", "ORDER", total=True)
line("REQUIREMENT", "FULFILS"); line("FULFILS", "ORDER")
card("1", 7.35, 8.0); card("N", 12.5, 4.75)
card("0..1", 22.7, 8.0); card("N", 18.1, 4.85)

relation("PLACES", 29.65, 5.6)
path([(23, 16.8), (29.65, 16.8), (29.65, 5.6)])
path([(29.65, 5.6), (29.65, 3.6), (15, 3.6)], total=True)
card("1", 29.25, 15.9); card("N", 17.4, 3.95)

for n, x, y, d, k in [("order_id", 14.3, 5.0, False, True), ("status", 16.4, 5.0, False, False),
                      ("quantity_kg", 12.3, 2.3, False, False), ("price_per_kg", 13.95, 1.85, False, False),
                      ("total_amount", 16.25, 1.85, True, False), ("placed_at", 17.9, 2.3, False, False)]:
    attr("ORDER", n, x, y, key=k, derived=d)

# delivery (1:1)
relation("SHIPPED_VIA", 9.4, 2.4)
entity("DELIVERY", 5.3, 2.4)
line("ORDER", "SHIPPED_VIA"); line("SHIPPED_VIA", "DELIVERY", total=True)
card("1", 12.0, 3.25); card("1", 7.0, 2.75)
for i, n in enumerate(["delivery_id", "vehicle_no", "pickup_date", "expected_date", "delivered_date"]):
    attr("DELIVERY", n, 2.2 + i * 1.95, 1.0 if i % 2 == 0 else 0.45, key=(n == "delivery_id"))

# status history: weak entity identified by ORDER
relation("HAS_HISTORY", 21.7, 2.4, identifying=True)
entity("STATUS_HISTORY", 26.6, 2.4, weak=True)
line("ORDER", "HAS_HISTORY"); line("HAS_HISTORY", "STATUS_HISTORY", total=True)
card("1", 18.2, 2.75); card("N", 23.9, 2.75)
for n, x, y, pk in [("history_id", 23.6, 0.95, True), ("old_status", 25.6, 0.5, False),
                    ("new_status", 27.6, 0.95, False), ("changed_at", 29.5, 0.5, False)]:
    attr("STATUS_HISTORY", n, x, y, partial=pk)

# reviews: M:N between USER (reviewer) and ORDER
relation("REVIEWS", 1.2, 3.6)
path([(15, 20.2), (1.2, 20.2), (1.2, 3.6)])
line("REVIEWS", (14.0, 3.6))
card("M", 0.75, 19.6); card("N", 10.3, 3.95)
for n, x, y in [("rating", 3.1, 4.75), ("comment", 5.1, 4.75), ("created_at", 1.2, 2.1)]:
    attr("REVIEWS", n, x, y)

# ---------------- title and legend ----------------
ax.text(-0.3, 22.35, "AgriLink – ER Diagram", fontsize=28, weight="bold", color="#2E7D32", va="center")
ax.text(-0.3, 21.75, "Chen notation · cardinality shown in red · double line = total participation",
        fontsize=14, color="#555555", va="center")

lx, ly = 21.6, 22.35
ax.add_patch(Rectangle((lx - 0.3, 19.3), 9.6, 3.35, fc="#fafafa", ec="#999999", lw=1, zorder=3))
items = [
    ("ent", "Entity"), ("weak", "Weak entity"), ("rel", "Relationship"), ("idrel", "Identifying relationship"),
    ("att", "Attribute"), ("key", "Key attribute"), ("der", "Derived attribute"), ("dbl", "Total participation"),
]
for i, (kind, label) in enumerate(items):
    cx = lx + 0.8 + (4.8 if i >= 4 else 0)
    cy = ly - 0.45 - (i % 4) * 0.75
    if kind in ("ent", "weak"):
        ax.add_patch(Rectangle((cx - 0.6, cy - 0.22), 1.2, 0.44, fc=ENT, ec=INK, lw=1.5, zorder=5))
        if kind == "weak":
            ax.add_patch(Rectangle((cx - 0.52, cy - 0.14), 1.04, 0.28, fc="none", ec=INK, lw=1, zorder=6))
    elif kind in ("rel", "idrel"):
        ax.add_patch(Polygon([(cx - 0.65, cy), (cx, cy + 0.3), (cx + 0.65, cy), (cx, cy - 0.3)], fc=REL, ec=INK, lw=1.5, zorder=5))
        if kind == "idrel":
            ax.add_patch(Polygon([(cx - 0.5, cy), (cx, cy + 0.22), (cx + 0.5, cy), (cx, cy - 0.22)], fc="none", ec=INK, lw=1, zorder=6))
    elif kind == "dbl":
        ax.plot([cx - 0.6, cx + 0.6], [cy, cy], color=INK, lw=5.5, zorder=5, solid_capstyle="butt")
        ax.plot([cx - 0.6, cx + 0.6], [cy, cy], color="white", lw=2.2, zorder=6, solid_capstyle="butt")
    else:
        ax.add_patch(Ellipse((cx, cy), 1.25, 0.46, fc=ATT, ec=INK, lw=1.3, zorder=5, ls="--" if kind == "der" else "-"))
        if kind == "key":
            ax.text(cx, cy, "id", ha="center", va="center", fontsize=11, zorder=7)
            ax.plot([cx - 0.12, cx + 0.12], [cy - 0.13, cy - 0.13], color=INK, lw=1, zorder=7)
    ax.text(cx + 0.85, cy, label, fontsize=13, va="center", zorder=7)

for ext in ("png", "svg"):
    fig.savefig(f"er_diagram.{ext}", dpi=130, bbox_inches="tight", facecolor="white")
print("saved er_diagram.png / .svg")
