# CineNest Performance Results

Measurement date: 18 September 2026 (`Asia/Ho_Chi_Minh`).

## Environment

| Component        | Configuration                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| Machine          | Intel Core i5-1145G7, 4 cores / 8 threads, 15.4 GB RAM                                         |
| Operating system | Windows 11 Pro 10.0.26200                                                                      |
| Node.js          | 24.20.0                                                                                        |
| PostgreSQL       | 16.15 in Docker using `postgres:16`                                                            |
| Python / Locust  | Python 3.12.14 / Locust 2.46.6                                                                 |
| Dataset          | 10,000 historical bookings: 6,500 Completed, 2,500 Cancelled, 1,000 No-show                    |
| Topology         | Backend and Locust on the same machine using localhost; CSV captured with `--csv-full-history` |

These measurements represent a controlled local benchmark. They are not a production service-level guarantee.

## Load-test results

| Scenario |                                           Load | Main request              | Requests |            p95 | Unexpected error rate | Business result                                                   |
| -------- | ---------------------------------------------: | ------------------------- | -------: | -------------: | --------------------: | ----------------------------------------------------------------- |
| PF01     |                 50 users, ramp 10/s, 5 minutes | `GET /rooms/availability` |    4,233 |          27 ms |                    0% | Correct room results with 10,000 historical bookings              |
| PF02     |               200 users competing for one slot | `POST /bookings`          |      200 |       1,500 ms |                    0% | 1×201, 199×409, exactly one database booking                      |
| PF03     | Ramp to 300 users and back down over 8 minutes | Complete journey          |   46,331 | 110 ms overall |                    0% | 552×201, 4×409, 1,154 valid 422 responses, no unexpected response |

### PF03 by endpoint

| Endpoint                  | Requests | Median |    p95 |  Maximum |
| ------------------------- | -------: | -----: | -----: | -------: |
| `GET /rooms/availability` |   27,084 |  15 ms | 130 ms |   848 ms |
| `GET /rooms/:id`          |   17,237 |  12 ms |  84 ms |   844 ms |
| `POST /bookings`          |    1,710 |  29 ms | 100 ms | 1,003 ms |
| `POST /auth/login`        |      300 | 560 ms | 870 ms |   956 ms |

PF02 measured login separately: 200 simultaneous bcrypt logins reached approximately 16 seconds p95, while the contended booking operation reached 1.5 seconds p95. The 409 responses are the correct outcome for losing the race and are marked as successful business results in Locust.

## Lighthouse before and after

Page: `frontend/index.html` using the default mobile preset in headless Chrome.

| Category       | Before | After |
| -------------- | -----: | ----: |
| Performance    |     72 |    76 |
| Accessibility  |    100 |   100 |
| Best Practices |     96 |    96 |
| SEO            |     91 |   100 |

### Core metrics

| Metric                   | Before | After |       Change |
| ------------------------ | -----: | ----: | -----------: |
| First Contentful Paint   |  1.0 s | 1.0 s |    unchanged |
| Largest Contentful Paint |  4.6 s | 3.7 s | 0.9 s faster |
| Speed Index              |  1.5 s | 1.4 s | 0.1 s faster |
| Total Blocking Time      |   0 ms |  0 ms |    unchanged |
| Cumulative Layout Shift  |      0 |     0 |    unchanged |

The main frontend improvement was LCP. Accessibility remained at 100 and SEO reached 100. Best Practices remained at 96 because the public page probes `/api/me`; a signed-out visitor correctly receives 401, which the measured Lighthouse version records as a failed network response.

## Optimization evidence

The release includes:

- A composite partial index for active room conflicts.
- A GiST exclusion constraint for final overlap enforcement.
- Paginated movie queries.
- Server-side search and genre filters.
- Lazy-loaded media and explicit image dimensions.
- Deferred authenticated navigation mounting on public pages.
- Bundled menu images.

## Reproduction

The repository retains:

- `perf/locustfile.py`
- `perf/ramp.py`
- `perf/generate_history.py`
- `docs/performance/PF02_2026-09-16.md`
- `perf/reports/lighthouse-before.report.json`
- `perf/reports/lighthouse-after.report.json`

Generated detailed CSV/HTML output remains local to keep the repository compact. Follow `perf/README.md`, restore the same seed before each run, and record any environment differences.
