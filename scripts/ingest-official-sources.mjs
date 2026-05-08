import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourcesPath = join(root, "data", "sources.json");
const rawDir = join(root, "data", "raw");

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "hantavirus-information-map/1.0",
    },
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function ingestWhoDiseaseOutbreakNews(source) {
  const payload = await fetchJson(source.apiUrl);
  const serialized = JSON.stringify(payload, null, 2);
  const document = {
    sourceId: source.id,
    sourceName: source.name,
    fetchedAt: new Date().toISOString(),
    url: source.apiUrl,
    hash: hash(serialized),
    payload,
  };

  await mkdir(rawDir, { recursive: true });
  await writeFile(
    join(rawDir, `who-don-${document.fetchedAt.slice(0, 10)}.json`),
    JSON.stringify(document, null, 2),
  );

  return {
    sourceId: source.id,
    fetchedAt: document.fetchedAt,
    hash: document.hash,
    itemCount: Array.isArray(payload.value) ? payload.value.length : null,
  };
}

async function main() {
  const registry = JSON.parse(await readFile(sourcesPath, "utf8"));
  const results = [];

  for (const source of registry.sources) {
    if (source.id !== "who-don" || !source.apiUrl) continue;
    results.push(await ingestWhoDiseaseOutbreakNews(source));
  }

  await writeFile(
    join(rawDir, "last-run.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2),
  );
  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
