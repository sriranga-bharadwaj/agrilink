"""Minimal data.gov.in API client. Reads DATA_GOV_IN_API_KEY from ml/.env and never prints it."""
import json
import time
from pathlib import Path

import requests

ML_DIR = Path(__file__).resolve().parent
BASE = "https://api.data.gov.in/resource/"


def api_key() -> str:
    for line in (ML_DIR / ".env").read_text(encoding="utf-8").splitlines():
        name, _, value = line.partition("=")
        if name.strip() == "DATA_GOV_IN_API_KEY" and value.strip():
            return value.strip()
    raise SystemExit("DATA_GOV_IN_API_KEY missing from ml/.env")


def get(resource_id: str, params: dict | None = None, retries: int = 4, timeout: int = 60) -> dict:
    """GET one page. Errors are reported without the key (the URL is never printed)."""
    query = {"api-key": api_key(), "format": "json", **(params or {})}
    for attempt in range(retries):
        try:
            r = requests.get(BASE + resource_id, params=query, timeout=timeout)
            if r.status_code == 200:
                return r.json()
            err = f"HTTP {r.status_code}: {r.text[:200]}"
        except (requests.RequestException, json.JSONDecodeError) as e:
            err = type(e).__name__
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"{resource_id} failed after {retries} tries ({err})")
