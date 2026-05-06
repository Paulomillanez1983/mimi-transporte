#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const FIX = process.argv.includes("--fix");
const TEXT_EXT = new Set([
  ".html", ".css", ".js", ".mjs", ".json", ".md", ".txt", ".toml", ".sql", ".ts"
]);
const SKIP_DIRS = new Set([".git", ".vercel", "node_modules"]);

const replacements = new Map([
  ["\u00c3\u00a1", "á"], ["\u00c3\u00a9", "é"], ["\u00c3\u00ad", "í"], ["\u00c3\u00b3", "ó"], ["\u00c3\u00ba", "ú"],
  ["\u00c3\u0081", "Á"], ["\u00c3\u0089", "É"], ["\u00c3\u008d", "Í"], ["\u00c3\u0093", "Ó"], ["\u00c3\u009a", "Ú"],
  ["\u00c3\u00b1", "ñ"], ["\u00c3\u0091", "Ñ"], ["\u00c3\u00bc", "ü"], ["\u00c2\u00bf", "¿"], ["\u00c2\u00a1", "¡"],
  ["\u00c2\u00b7", "·"], ["\u00e2\u20ac\u201c", "-"], ["\u00e2\u20ac\u201d", "-"], ["\u00e2\u20ac\u02dc", "'"], ["\u00e2\u20ac\u2122", "'"],
  ["\u00e2\u20ac\u0153", "\""], ["\u00e2\u20ac\u009d", "\""], ["\u00e2\u20ac\u00a6", "..."], ["\u00e2\u2020\u2019", "->"],
  ["\u00f0\u0178\u201d\u00a5", ""], ["\u00f0\u0178\u0161\u2014", ""], ["\u00f0\u0178\u201c\u00b7", ""], ["\u00f0\u0178\u201c\u201e", ""]
]);

const suspicious = [/\u00c3|\u00c2|\u00e2\u20ac|\u00f0\u0178|\uFFFD/u];
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (TEXT_EXT.has(path.extname(entry.name).toLowerCase())) {
      files.push(full);
    }
  }
}

function repair(text) {
  let output = text;
  for (const [bad, good] of replacements) {
    output = output.split(bad).join(good);
  }
  return output;
}

walk(ROOT);

const findings = [];
let changed = 0;

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const repaired = repair(text);
  const matches = text.split(/\r?\n/).flatMap((line, index) =>
    suspicious.some((pattern) => pattern.test(line))
      ? [{ line: index + 1, text: line.trim().slice(0, 180) }]
      : []
  );

  if (matches.length) findings.push({ file: path.relative(ROOT, file), matches });

  if (FIX && repaired !== text) {
    fs.writeFileSync(file, repaired, "utf8");
    changed += 1;
  }
}

console.log(JSON.stringify({
  ok: findings.length === 0 || FIX,
  mode: FIX ? "fix" : "audit",
  filesScanned: files.length,
  filesWithFindings: findings.length,
  filesChanged: changed,
  findings: findings.slice(0, 80)
}, null, 2));

if (!FIX && findings.length) process.exitCode = 1;
