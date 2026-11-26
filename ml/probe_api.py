"""Phase 0, step 1: find out what the data.gov.in mandi price resources actually support.
Prints totals, field names, sample rows and which filters / sorts work. Usage: python ml/probe_api.py"""
import json

from datagov import get

RESOURCES = {
    "variety-wise daily prices": "35985678-0d79-46b4-9ed6-6f13308a1d24",
    "current daily prices": "9ef84268-d588-465a-a308-a864a43d0070",
}


def show(label, resource, params):
    try:
        d = get(resource, {"limit": 3, **params})
    except RuntimeError as e:
        print(f"  {label:45} ERROR {e}")
        return None
    rows = d.get("records", [])
    dates = [r.get("Arrival_Date") or r.get("arrival_date") for r in rows]
    print(f"  {label:45} total={d.get('total')} count={d.get('count')} dates={dates}")
    return d


for name, rid in RESOURCES.items():
    print(f"\n=== {name} ({rid})")
    d = show("no filter", rid, {})
    if not d:
        continue
    print("  title:", d.get("title"))
    print("  updated:", d.get("updated_date"), "| org:", d.get("org"))
    print("  fields:", [(f.get("id"), f.get("type")) for f in d.get("field", [])])
    print("  sample:", json.dumps(d.get("records", [None])[0], ensure_ascii=False))

    ids = [f.get("id") for f in d.get("field", [])]
    state = next((i for i in ids if i.lower() == "state"), "State")
    commodity = next((i for i in ids if i.lower() == "commodity"), "Commodity")
    date = next((i for i in ids if "date" in i.lower()), "Arrival_Date")
    for label, params in [
        ("state=Karnataka", {f"filters[{state}]": "Karnataka"}),
        ("state.keyword=Karnataka", {f"filters[{state}.keyword]": "Karnataka"}),
        ("commodity=Tomato", {f"filters[{commodity}]": "Tomato"}),
        ("state+commodity Karnataka Tomato", {f"filters[{state}]": "Karnataka", f"filters[{commodity}]": "Tomato"}),
        ("date=01/01/2024", {f"filters[{date}]": "01/01/2024"}),
        ("date=2024-01-01", {f"filters[{date}]": "2024-01-01"}),
        ("sort date asc", {f"sort[{date}]": "asc"}),
        ("sort date desc", {f"sort[{date}]": "desc"}),
    ]:
        show(label, rid, params)
