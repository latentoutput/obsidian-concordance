import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");
const TABLE_PATH = join(SCRIPT_DIR, "obsidian-api-versions.json");
const MANIFEST_PATH = join(ROOT, "manifest.json");
const SRC_DIR = join(ROOT, "src");

const TABLE = JSON.parse(readFileSync(TABLE_PATH, "utf8"));
const MANIFEST = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

function* walkTsFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const st = statSync(path);
    if (st.isDirectory()) {
      yield* walkTsFiles(path);
    } else if (/\.tsx?$/.test(entry)) {
      yield path;
    }
  }
}

const IMPORT_RE = /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["']obsidian["']/g;

const used = new Map();
for (const file of walkTsFiles(SRC_DIR)) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(IMPORT_RE)) {
    const names = match[1]
      .split(",")
      .map((s) => s.replace(/^\s*type\s+/, "").trim())
      .filter(Boolean);
    for (const name of names) {
      if (!used.has(name)) used.set(name, new Set());
      used.get(name).add(file);
    }
  }
}

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

const unknown = [];
const known = [];
for (const [name, files] of used) {
  if (Object.hasOwn(TABLE, name)) {
    known.push({ name, version: TABLE[name] });
  } else {
    unknown.push({
      name,
      files: [...files].map((f) => relative(ROOT, f)),
    });
  }
}

known.sort((a, b) => compareVersions(b.version, a.version));
const honestFloor = known[0]?.version ?? "0.0.0";
const declared = MANIFEST.minAppVersion;

console.log(`Declared minAppVersion: ${declared}`);
console.log(`Honest floor (from imports): ${honestFloor}`);
if (known.length > 0) {
  const drivers = known
    .filter((k) => compareVersions(k.version, honestFloor) === 0)
    .map((k) => k.name)
    .join(", ");
  console.log(`Driven by: ${drivers}`);
}

if (unknown.length > 0) {
  console.error("");
  console.error(`Unknown obsidian symbols (add to ${relative(ROOT, TABLE_PATH)}):`);
  for (const u of unknown) {
    console.error(`  - ${u.name}  (${u.files.join(", ")})`);
  }
  process.exit(2);
}

if (compareVersions(declared, honestFloor) < 0) {
  console.error("");
  console.error(`minAppVersion ${declared} is below the honest floor ${honestFloor}.`);
  console.error(`Raise minAppVersion in manifest.json to at least ${honestFloor}.`);
  process.exit(1);
}

console.log("");
console.log("OK: manifest.json minAppVersion is at or above the honest floor.");
