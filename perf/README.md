# CineNest Performance Testing

This directory contains reproducible Locust scenarios for availability search, booking contention, and the complete customer journey.

## Setup

Create and activate a Python environment, then install the pinned tools:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r perf/requirements.txt
```

Windows PowerShell activation:

```powershell
.venv\Scripts\Activate.ps1
```

Load performance accounts into a disposable development/performance database:

```bash
SEED_PERF=1 npm run db:seed --workspace backend
```

PowerShell:

```powershell
$env:SEED_PERF="1"
npm run db:seed --workspace backend
```

The seed command resets the selected database. Never point it at a database containing data that must be preserved.

Start the API on port 3000 before running Locust:

```bash
npm run dev:api
```

## PF01 — Availability with historical data

Generate 10,000 deterministic bookings across the previous 12 months:

```bash
python perf/generate_history.py
```

The generator produces approximately 65% Completed, 25% Cancelled, and 10% No-show bookings, with at most five completed sessions per room per day. It only replaces rows with the `PFH-` prefix.

Run the Availability user described at the top of `perf/locustfile.py`. Record request count, p50, p95, maximum latency, error rate, database size, and machine configuration.

## PF02 — Concurrent booking contention

Run 200 independent customers against the same room and time. Each request uses a different account and idempotency key.

Expected business result:

- One HTTP 201 response.
- 199 HTTP 409 `ROOM_TAKEN` responses.
- No unexpected 422, 5xx, or timeout.
- Exactly one active booking in PostgreSQL for the target interval.

Example:

```bash
PF_DATE=2026-09-23 PF_ROOM=1 locust \
  -f perf/locustfile.py Contender \
  --headless \
  -u 200 \
  -r 200 \
  -t 2m \
  --host http://localhost:3000 \
  --csv perf/reports/pf02
```

An expected 409 is a successful contention outcome, not an application error.

## PF03 — Full journey ramp

PF03 ramps through increasing user levels up to 300 users and exercises login, room availability, room detail, and booking creation. Valid business rejections such as a full slot or booking quota are categorized separately from unexpected failures.

## Measurement rules

- Restore the same starting dataset before each before/after comparison.
- Use the same machine, database version, Node.js version, duration, and load shape.
- State whether the API and load generator share one machine or communicate over a network.
- Do not deliberately make a baseline slow.
- Report business outcomes alongside latency.
- Keep generated CSV and HTML artifacts out of Git unless they are required evidence.

## Lighthouse

With the frontend and backend running:

```bash
npx lighthouse http://localhost:5173/index.html \
  --chrome-flags="--headless --no-sandbox" \
  --only-categories=performance,accessibility,best-practices,seo \
  --output=json \
  --output=html \
  --output-path=perf/reports/lighthouse-after
```

Recorded results and environment details are in [reports/RESULTS.md](reports/RESULTS.md).
