# CineNest Documentation

This directory contains the product, engineering, verification, and presentation documentation for CineNest.

## Start here

| Document                                                | Purpose                                                                                 |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [Project README](../README.md)                          | Installation, features, commands, test entry points, and repository map                 |
| [Architecture](ARCHITECTURE.md)                         | Components, request flow, database model, lifecycle, security, and concurrency design   |
| [API reference](API.md)                                 | HTTP routes, access rules, payloads, response format, and error semantics               |
| [Cross-module contracts](CONTRACTS.md)                  | Stable service boundaries shared by booking, rooms, menu, and payment modules           |
| [Demo guide](DEMO_GUIDE.md)                             | Startup checklist, five-to-seven-minute presentation flow, manual verification, and Q&A |
| [UI design system](../design-system/cinenest/MASTER.md) | Color, typography, spacing, components, accessibility, and responsive behavior          |

## Verification and evidence

| Document                                                  | Purpose                                                                     |
| --------------------------------------------------------- | --------------------------------------------------------------------------- |
| [Release integration review](INTEGRATION_REVIEW.md)       | Integrated scope, corrections, automated checks, and known limitations      |
| [Booking integration tests](BOOKING_INTEGRATION_TESTS.md) | Concurrency, idempotency, lifecycle, and browser-flow evidence              |
| [Menu operations and Q&A](MENU_DEMO_QA.md)                | Menu data trust, serving workflow, checkout protection, and demo notes      |
| [Movie and performance Q&A](MOVIE_PERFORMANCE_QA.md)      | Movie versioning, import deduplication, load tests, and Lighthouse findings |
| [PF02 contention report](performance/PF02_2026-09-16.md)  | Reproducible 200-user double-booking protection result                      |
| [Performance guide](../perf/README.md)                    | Locust setup and execution                                                  |
| [Performance results](../perf/reports/RESULTS.md)         | PF01–PF03 and Lighthouse measurements                                       |

## Specification sources

- [Original Vietnamese business specification](DacTa_MovieCafeBookingSystem_v1.7.pdf) is retained as the submitted course artifact.
- [CineNest v1.8 addendum](CineNest_v1.8_ADDENDUM.md) records the final name, ownership boundaries, movie data source, and verification policy.

The running code, committed migrations, and automated tests are the source of truth when an older planning document contains stale implementation details.
