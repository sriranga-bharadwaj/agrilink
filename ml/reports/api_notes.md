# Phase 0, step 1: data.gov.in API probe notes

**Status: NOT PASSED.** The API backend was unavailable on 2026-11-26, so nothing could be validated yet.

## What was tried (2026-11-26)

| Request | Result |
|---|---|
| Resource `35985678-0d79-46b4-9ed6-6f13308a1d24` (variety-wise daily prices; ID not yet confirmed from the dataset page), `limit=3`, no filter | Read timeout after 60 s, ×4 attempts |
| Resource `9ef84268-d588-465a-a308-a864a43d0070` (current daily prices; ID not yet confirmed), `limit=3`, no filter | Read timeout after 60 s, ×4 attempts |
| `9ef84268…` with `filters[state.keyword]=Karnataka`, `limit=1` | HTTP 502 after 60.9 s |
| `35985678…` with `filters[State]=Karnataka&filters[Commodity]=Tomato`, `limit=1` | HTTP 502 after 61.0 s |
| **Control:** made-up 56-character key, real resource ID | HTTP 502 after 60.7 s |
| **Control:** real key, made-up resource ID `00000000-…` | HTTP 502 after 61.2 s |

**Conclusion:** the gateway (`api.data.gov.in`) is reachable, but its backend is not answering, whatever the key or resource ID. That rules out a bad key or a bad ID as the cause. It is an outage on the provider's side.

**Retry (later on 2026-11-26):** both resources, `limit=1` with a state filter, still returned HTTP 502 after 61 s.

## Connectivity checks

`www.data.gov.in`, `agmarknet.gov.in`, `agmarknet.ceda.ashoka.edu.in` and `www.google.com` all answered HTTP 200 in under 0.4 s.

## Dataset pages and fallbacks (read-only)

- The two data.gov.in resource pages returned **HTTP 403** to automated fetching. The resource IDs, field names and update dates are therefore still **unconfirmed**.
- **CEDA Agmarknet mirror:**
  - It is a JavaScript app whose calculation selector defaults to **"Monthly"**. Variety and market-level breakdowns are not stated.
  - It has a "Download Data" button. No licence is stated beyond attribution to DMI, Ministry of Agriculture.
  - Its README URL returns 404.
  - **If the data is monthly only, it does not support the approved 7-day daily design.** Switching to it would need the user's decision.
- **agmarknet.gov.in (Agmarknet 2.0):** a JavaScript app. Report and download options could not be read without a browser.

## Next steps

1. Retry the API later with a single request per call, with no retry loop.
2. Once it answers, record:
   - the confirmed resource ID
   - field names
   - working filter, date and sort syntax
   - total row counts
   - the rate limit
3. Then run `fetch_prices.py` and `validate_data.py`.
