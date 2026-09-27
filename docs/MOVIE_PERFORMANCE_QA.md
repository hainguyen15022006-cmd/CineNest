# Movie Catalogue and Performance Q&A

## Why do movie preparation updates use `movieVersion` and `expectedVersion`?

A staff preparation screen may remain open while the customer changes the selected movie. Every movie change increments `movieVersion`. The preparation request includes the version that staff saw. If it no longer matches, the API returns `MOVIE_CHANGED` and does not apply the stale action to the replacement movie.

## Why is movie preparation transactional?

One update checks the booking, checks the movie, changes preparation state, and records history. A transaction makes those steps atomic. If any step fails, the database does not retain a partial update.

## What happens when a manager deactivates a movie used by an upcoming booking?

The booking remains valid, but preparation becomes `UNAVAILABLE` for affected Confirmed or In-use bookings. The system increments `movieVersion`, forcing staff to reload before taking another preparation action.

## How does the importer prevent duplicate films?

The importer uses the source and TMDB external ID as its stable identity. It removes duplicates within the input file and compares source IDs already stored in PostgreSQL. Running the same import again adds no duplicate records, even when different films share a title.

## Why are some age ratings `NR`?

The source metadata does not provide complete Vietnamese classifications. `NR` means “Not Rated” and avoids inventing a rating. A manager may update it after checking an appropriate source.

## Why is the movie API paginated?

The full imported catalogue may contain several thousand records. Pagination limits database work, response size, memory use, and DOM rendering. Search, genre, runtime, page, and limit filters are applied on the server.

## What does PF01 measure?

PF01 runs 50 users, spawning 10 per second for five minutes, against availability search with 10,000 historical bookings. The recorded run served 4,233 availability requests with 27 ms p95 and no errors.

## What does PF02 prove?

PF02 sends 200 booking requests for one room and time. The recorded result was one HTTP 201, 199 expected HTTP 409 conflicts, no unexpected responses, and exactly one database booking. Booking-request p95 during contention was 1,500 ms.

## What does PF03 measure?

PF03 ramps a complete journey from 0 to 300 users. The recorded run produced 46,331 requests, no unexpected errors, and 110 ms overall p95. Availability p95 was 130 ms, booking p95 100 ms, and login p95 870 ms.

## Why is login slower than read endpoints?

Login verifies a bcrypt password hash, which intentionally consumes CPU. Stable users reuse a session, so repeated catalogue and booking requests do not repeat that cost.

## Why did Lighthouse Best Practices score 96 instead of 100?

The public home page requests `/api/me` to detect an existing session. For a signed-out visitor, the API correctly returns 401. The measured Lighthouse version records that response in Best Practices. Returning 200 would weaken the authentication contract merely to improve a score.

## What are the remaining performance limitations?

The recorded mobile LCP was 3.7 seconds, influenced by external room images. Heavy simultaneous login traffic also increases CPU use because of bcrypt. Future work should self-host optimized room images, use production caching and compression, and repeat tests on an environment separated from the load generator.
