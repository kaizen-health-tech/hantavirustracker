import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const rawDir = join(root, "data", "raw");
const queuePath = join(root, "data", "review-queue.json");

function getItems(payload) {
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload)) return payload;
  return [];
}

function textFromItem(item) {
  return [
    item.Title,
    item.title,
    item.Overview,
    item.Summary,
    item.Description,
    item.UrlName,
    item.PublicationDate,
  ]
    .filter(Boolean)
    .join(" ");
}

function itemUrl(item) {
  if (item.ItemDefaultUrl) return `https://www.who.int${item.ItemDefaultUrl}`;
  if (item.UrlName) return `https://www.who.int/emergencies/disease-outbreak-news/item/${item.UrlName}`;
  return "https://www.who.int/emergencies/disease-outbreak-news";
}

async function latestRawWhoFile() {
  const files = (await readdir(rawDir))
    .filter((file) => file.startsWith("who-don-") && file.endsWith(".json"))
    .sort();
  return files.at(-1);
}

async function main() {
  const latest = await latestRawWhoFile();
  if (!latest) throw new Error("No WHO raw snapshot found. Run npm run ingest:official first.");

  const snapshot = JSON.parse(await readFile(join(rawDir, latest), "utf8"));
  const candidates = getItems(snapshot.payload)
    .filter((item) => /hantavirus/i.test(textFromItem(item)))
    .map((item) => ({
      status: "needs_review",
      sourceId: snapshot.sourceId,
      sourceName: snapshot.sourceName,
      sourceHash: snapshot.hash,
      fetchedAt: snapshot.fetchedAt,
      title: item.Title || item.title || item.UrlName || "Untitled WHO update",
      publishedAt: item.PublicationDate || item.LastModified || null,
      url: itemUrl(item),
      reason: "Matched keyword: hantavirus",
      suggestedRecordType: "official",
      requiredReviewerChecks: [
        "Confirm this item is specifically about hantavirus.",
        "Extract case counts only when explicitly stated.",
        "Set geographic precision honestly: country, state, city, port, or approximate region.",
        "Attach all official source URLs before publication.",
      ],
    }));

  await writeFile(
    queuePath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sourceSnapshot: latest,
        candidates,
      },
      null,
      2,
    ),
  );

  console.log(JSON.stringify({ ok: true, candidateCount: candidates.length, queuePath }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
