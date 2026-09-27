# Movie Import Samples

These small files validate the movie importer without downloading the full external dataset. Every row represents a real film.

| File                         | Format                                                             | Notes                                                                                             |
| ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `movies_metadata.sample.csv` | The 24-column `movies_metadata.csv` format from The Movies Dataset | Ten representative rows; `genres` uses a Python-style serialized value and runtime may be decimal |
| `movielens.sample.csv`       | MovieLens `movieId,title,genres`                                   | No runtime; use `--assume-runtime`                                                                |
| `phim-viet.sample.csv`       | Generic `title,year,runtime,genre,age,description`                 | Small manually curated Vietnamese-film format                                                     |

Run the primary sample from the repository root:

```bash
npm run db:import-movies -- --file data/samples/movies_metadata.sample.csv --min-votes 0
```

For the complete catalogue, download `movies_metadata.csv` from [The Movies Dataset on Kaggle](https://www.kaggle.com/datasets/rounakbanik/the-movies-dataset) and place it in `backend/data/`. The large source file is ignored by Git; only these small samples belong in the repository.
