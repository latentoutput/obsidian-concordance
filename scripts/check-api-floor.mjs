#!/usr/bin/env node
/**
 * Typecheck src/ against the Obsidian API typings that match manifest.json's
 * minAppVersion, rather than whatever version happens to be installed.
 *
 * The installed `obsidian` devDependency tracks the latest API so editing and
 * tooling stay current. That means the compiler will happily accept an API that
 * does not exist on our declared floor, which then throws at runtime for a user
 * we claim to support. This check closes that gap: it fails only when the code
 * actually reaches past the floor, which is the moment to decide whether to
 * avoid the API or raise minAppVersion.
 *
 * Complements check-min-app-version.mjs, which inspects imported symbol names
 * only and so cannot see method calls such as MetadataCache#fileToLinktext.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, "node_modules", ".cache", "obsidian-api-floor");

function parse(version) {
  const [core] = version.split("-");
  const [major = 0, minor = 0, patch = 0] = core.split(".").map(Number);
  return { major, minor, patch };
}

function compare(a, b) {
  const x = parse(a);
  const y = parse(b);
  return x.major - y.major || x.minor - y.minor || x.patch - y.patch;
}

/**
 * Pick the newest published typings whose major.minor is at or below the floor.
 * npm does not publish a package per Obsidian release, so this lands on the
 * closest representative of the floor's line rather than the floor exactly.
 */
function pickTypingsVersion(published, floor) {
  const target = parse(floor);
  const candidates = published
    .filter((version) => !version.includes("-"))
    .filter((version) => {
      const v = parse(version);
      return v.major < target.major || (v.major === target.major && v.minor <= target.minor);
    });

  return candidates.sort(compare).pop() ?? null;
}

function listPublishedVersions() {
  try {
    const raw = execFileSync("npm", ["view", "obsidian", "versions", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function ensureTypings(version) {
  const dir = join(CACHE, version);
  const dts = join(dir, "package", "obsidian.d.ts");

  if (existsSync(dts)) {
    return dts;
  }

  mkdirSync(dir, { recursive: true });
  try {
    execFileSync("npm", ["pack", `obsidian@${version}`], {
      cwd: dir,
      stdio: ["ignore", "ignore", "ignore"],
    });
    execFileSync("tar", ["xzf", `obsidian-${version}.tgz`], { cwd: dir, stdio: "ignore" });
  } catch {
    return null;
  }

  return existsSync(dts) ? dts : null;
}

const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
const floor = manifest.minAppVersion;
console.log(`Declared minAppVersion: ${floor}`);

const published = listPublishedVersions();

if (!published) {
  console.warn("WARN: could not reach npm to resolve floor typings. Skipping.");
  process.exit(0);
}

const typingsVersion = pickTypingsVersion(published, floor);

if (!typingsVersion) {
  console.warn(`WARN: no published obsidian typings at or below ${floor}. Skipping.`);
  process.exit(0);
}

console.log(`Floor typings: obsidian@${typingsVersion}`);

const dts = ensureTypings(typingsVersion);

if (!dts) {
  console.warn(`WARN: could not download obsidian@${typingsVersion} typings. Skipping.`);
  process.exit(0);
}

const configPath = join(ROOT, "tsconfig.api-floor.json");
writeFileSync(
  configPath,
  `${JSON.stringify(
    {
      extends: "./tsconfig.json",
      compilerOptions: { noEmit: true, skipLibCheck: true, paths: { obsidian: [dts] } },
      include: ["src/**/*.ts"],
    },
    null,
    2,
  )}\n`,
);

try {
  execFileSync("npx", ["tsc", "-p", configPath], { cwd: ROOT, stdio: "inherit" });
  console.log(`\nOK: src compiles against the obsidian@${typingsVersion} API surface.`);
} catch {
  console.error(
    `\nFAIL: src uses APIs missing from obsidian@${typingsVersion}, but manifest.json` +
      `\npromises support for Obsidian ${floor}. Either avoid the newer API or raise` +
      `\nminAppVersion (and versions.json) to the release that introduced it.`,
  );
  process.exitCode = 1;
} finally {
  rmSync(configPath, { force: true });
}
