#!/usr/bin/env node
// CLI for the pixel-review package.
//   npx pixel-review init   — scaffold .claude/commands/pixel-review.md into the current repo
//   npx pixel-review diff   — show how your local command file differs from this package's version
//
// The Playwright driver (src/driver.js) and report template/principles (assets/) are NOT copied
// anywhere — the scaffolded command file references them directly inside node_modules/pixel-review/,
// so they always match whatever version of this package is installed.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, "..");

const SRC_COMMAND = path.join(pkgRoot, "assets", "command.md");
const DEST_DIR = path.join(process.cwd(), ".claude", "commands");
const DEST_COMMAND = path.join(DEST_DIR, "pixel-review.md");

function init() {
  if (!fs.existsSync(SRC_COMMAND)) {
    console.error("Internal error: assets/command.md missing from this package's install.");
    process.exit(1);
  }
  const src = fs.readFileSync(SRC_COMMAND, "utf8");

  if (fs.existsSync(DEST_COMMAND)) {
    const dest = fs.readFileSync(DEST_COMMAND, "utf8");
    if (dest === src) {
      console.log("✅ .claude/commands/pixel-review.md is already up to date.");
      return;
    }
    console.log("⚠️  .claude/commands/pixel-review.md already exists and differs from this");
    console.log("   package's version — NOT overwriting (it may be customized).");
    console.log("   Run `npx pixel-review diff` to see what changed, then merge by hand.");
    return;
  }

  fs.mkdirSync(DEST_DIR, { recursive: true });
  fs.writeFileSync(DEST_COMMAND, src);
  console.log("✅ Wrote .claude/commands/pixel-review.md\n");
  console.log("Next steps:");
  console.log(
    "  1. Make sure pixel-review is a devDependency (pnpm add -D pixel-review / npm install -D pixel-review)"
  );
  console.log("  2. Run once per machine: npx playwright install chromium");
  console.log("  3. Run /pixel-review inside Claude Code");
}

function showDiff() {
  if (!fs.existsSync(DEST_COMMAND)) {
    console.log("No .claude/commands/pixel-review.md found — run `npx pixel-review init` first.");
    return;
  }
  try {
    // Left = your repo's file, right = this package's bundled version.
    execSync(`diff -u "${DEST_COMMAND}" "${SRC_COMMAND}"`, { stdio: "inherit" });
    console.log("No differences — your command file matches this package's version.");
  } catch (err) {
    if (err.status !== 1) {
      console.error("Could not run `diff` — compare the files manually:");
      console.error(`  ${DEST_COMMAND}`);
      console.error(`  ${SRC_COMMAND}`);
    }
    // status 1 = diff found differences, already streamed above via stdio: inherit.
  }
}

const cmd = process.argv[2];

switch (cmd) {
  case "init":
    init();
    break;
  case "diff":
    showDiff();
    break;
  default:
    console.log("Usage: pixel-review <init|diff>\n");
    console.log("  init  Scaffold .claude/commands/pixel-review.md into the current repo");
    console.log("  diff  Show how your local command file differs from this package's version");
    process.exit(cmd ? 1 : 0);
}
