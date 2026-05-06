#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const files = ["driver-onboarding.html", "chofer-panel.html", "index.html", "admin/admin-panel.html"];
const results = [];

for (const file of files) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) continue;
  const html = fs.readFileSync(full, "utf8");
  let checked = 0;
  let skipped = 0;
  const errors = [];

  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = match[1] || "";
    const code = match[2].trim();
    if (!code) continue;
    if (/type=["']module["']/i.test(attrs) || /^import\s/m.test(code)) {
      skipped += 1;
      continue;
    }
    try {
      new Function(code);
      checked += 1;
    } catch (error) {
      errors.push(error.message);
    }
  }

  results.push({ file, checked, skipped, errors });
}

const ok = results.every((item) => item.errors.length === 0);
console.log(JSON.stringify({ ok, results }, null, 2));
if (!ok) process.exitCode = 1;
