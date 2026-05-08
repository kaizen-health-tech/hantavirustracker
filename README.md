# Hantavirus Information Map

A source-backed informational map for hantavirus updates, official public-health guidance, and reviewed citations.

## Run

```bash
npm run dev
```

Then open `http://localhost:4173`.

## Data

Records are loaded from `data/events.json`. Official source metadata is in `data/sources.json`.

Run the first official-source ingestion job with:

```bash
npm run ingest:official
npm run build:review-queue
```

The ingestion job stores raw WHO Disease Outbreak News responses under `data/raw/` so normalized map records can be generated with source hashes and timestamps. The review queue surfaces candidate hantavirus records from official documents, but nothing should publish to `data/events.json` until reviewed.

## Notes

This site is informational and source-backed. It is not medical advice. For diagnosis, treatment, and official case counts, consult CDC, WHO, and local public health authorities.
