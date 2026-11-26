"""Time a single small request against a resource. Usage: python ml/probe_one.py <resource_id> [key=value ...]"""
import sys
import time

import requests

from datagov import BASE, api_key

rid = sys.argv[1]
params = {"api-key": api_key(), "format": "json", "limit": "1"}
params.update(a.split("=", 1) for a in sys.argv[2:])
t = time.time()
try:
    r = requests.get(BASE + rid, params=params, timeout=180)
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    print(f"HTTP {r.status_code} in {time.time() - t:.1f}s | total={body.get('total')} | "
          f"fields={[f.get('id') for f in body.get('field', [])]} | first={body.get('records', [None])[:1]} | "
          f"message={body.get('message') or r.text[:150] if r.status_code != 200 else ''}")
except requests.RequestException as e:
    print(f"{type(e).__name__} after {time.time() - t:.1f}s")
