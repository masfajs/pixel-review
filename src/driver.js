#!/usr/bin/env node
// Playwright automation driver for the /pixel-review Claude Code command.
// Called by the command as: node node_modules/pixel-review/src/driver.js --url <url> --out-dir <path> [--flow-config <path>] [--routes r1,r2] [--max-routes 20] [--no-profile] [--local-storage k=v,k2=v2]
// --local-storage: "key=value" pairs, comma-separated. Seeded via addInitScript so they are
// present BEFORE the app boots on every navigation — a prototype that reads a flag at startup
// (demo mode, feature toggles) cannot be reached by setting storage after load, and a
// post-navigation trigger step would need a reload dance on every route.

import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";

// ── Args ────────────────────────────────────────────────────────────────────

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i].startsWith("--")) {
    const key = process.argv[i].slice(2);
    const val = process.argv[i + 1];
    if (!val || val.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = val;
      i++;
    }
  }
}

const prototypeUrl = args.url;
const outDir = args["out-dir"];
const maxRoutes = parseInt(args["max-routes"] ?? "20", 10);
const useProfile = !args["no-profile"];
// --flow-config: path to JSON flow config (highest priority, PRD-driven state map)
const flowConfigPath = args["flow-config"] ?? null;
const flowConfig =
  flowConfigPath && fs.existsSync(flowConfigPath)
    ? JSON.parse(fs.readFileSync(flowConfigPath, "utf8"))
    : null;
// --routes: comma-separated paths (fallback targeted mode, no PRD)
const targetRoutes = args.routes
  ? args.routes
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean)
  : null;
const localStorageSeed = args["local-storage"]
  ? Object.fromEntries(
      args["local-storage"]
        .split(",")
        .map((pair) => pair.trim())
        .filter(Boolean)
        .map((pair) => {
          const at = pair.indexOf("=");
          return at === -1 ? [pair, "true"] : [pair.slice(0, at), pair.slice(at + 1)];
        })
    )
  : null;

if (!prototypeUrl || !outDir) {
  console.error("Usage: node node_modules/pixel-review/src/driver.js --url <url> --out-dir <path>");
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

// ── Chrome profile setup ────────────────────────────────────────────────────

function isChromeRunning() {
  try {
    execSync('pgrep -x "Google Chrome"', { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function copyProfileToTemp(src, dest) {
  const SKIP = new Set(["SingletonLock", "SingletonSocket", "SingletonCookie", "lockfile"]);
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (s) => {
      const base = path.basename(s);
      return !SKIP.has(base) && !base.endsWith(".log") && !base.endsWith(".lck");
    }
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const origin = new URL(prototypeUrl).origin;

function isSameOrigin(href) {
  try {
    return new URL(href, origin).origin === origin;
  } catch {
    return false;
  }
}

function normalizeHref(href) {
  try {
    const u = new URL(href, origin);
    return u.pathname + u.search;
  } catch {
    return null;
  }
}

const SKIP_PATTERNS = /logout|signout|sign-out|log-out|delete|remove|destroy/i;

async function extractLinks(page) {
  // Try standard href links first
  const hrefs = await page.$$eval("a[href]", (els) =>
    els.map((el) => el.getAttribute("href")).filter(Boolean)
  );
  const fromHref = hrefs
    .filter(
      (h) =>
        isSameOrigin(h) &&
        !h.startsWith("mailto:") &&
        !h.startsWith("tel:") &&
        !h.includes("#") &&
        !SKIP_PATTERNS.test(h)
    )
    .map(normalizeHref)
    .filter(Boolean);

  if (fromHref.length >= 3) return fromHref;

  // SPA fallback: collect nav item labels first, then click each by text (re-querying each time)
  const startUrl = page.url();
  const navLabels = await page.$$eval("a:not([href])", (els) =>
    els.map((el) => el.textContent?.trim()).filter((t) => t && t.length < 40)
  );
  const discovered = [];

  for (const label of navLabels.slice(0, 25)) {
    if (!label || SKIP_PATTERNS.test(label)) continue;
    try {
      // Click via JS to bypass actionability checks (nav items have no href)
      await page.evaluate((text) => {
        const el = Array.from(document.querySelectorAll("a:not([href])")).find(
          (a) => a.textContent?.trim() === text
        );
        if (el) el.click();
      }, label);
      await page.waitForTimeout(700);
      const afterUrl = page.url();
      if (afterUrl !== startUrl) {
        const normalized = normalizeHref(afterUrl);
        if (normalized && !discovered.includes(normalized)) {
          discovered.push(normalized);
        }
        await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 10_000 });
        await page.waitForTimeout(500);
      }
    } catch {
      // ignore — nav item may not navigate or page context may change
    }
  }

  return [...new Set([...fromHref, ...discovered])];
}

function pickDummyValue(placeholder, type, label) {
  const hint = (placeholder + " " + type + " " + label).toLowerCase();
  if (hint.includes("email")) return "budi@example.com";
  if (hint.includes("phone") || hint.includes("telepon") || hint.includes("hp"))
    return "081234567890";
  if (hint.includes("name") || hint.includes("nama")) return "Budi Santoso";
  if (hint.includes("search") || hint.includes("cari")) return "test";
  if (hint.includes("number") || hint.includes("angka") || type === "number") return "100";
  if (type === "date") return "2025-01-15";
  return "Sample input";
}

async function screenshotB64(page) {
  const buf = await page.screenshot({ type: "png", fullPage: false });
  return buf.toString("base64");
}

async function collectElements(page) {
  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button, [role=button]"))
      .map((el) => el.textContent?.trim())
      .filter((t) => t && t.length < 60)
      .slice(0, 10);

    const inputs = Array.from(document.querySelectorAll("input, textarea, select"))
      .map(
        (el) =>
          el.getAttribute("placeholder") ||
          el.getAttribute("aria-label") ||
          el.getAttribute("name") ||
          ""
      )
      .filter(Boolean)
      .slice(0, 10);

    const tables = Array.from(document.querySelectorAll("table, [role=table], .mp-table")).map(
      (tbl) => {
        const headers = Array.from(tbl.querySelectorAll("th, [role=columnheader]"))
          .map((th) => th.textContent?.trim())
          .filter(Boolean);
        const rows = tbl.querySelectorAll("tr, [role=row]").length;
        return { columns: headers, rows };
      }
    );

    const pixelComponents = [
      ...new Set(
        Array.from(document.querySelectorAll("[class]"))
          .flatMap((el) => Array.from(el.classList))
          .filter((c) => c.startsWith("mp-"))
          .map((c) => {
            const match = c.match(/^mp-([a-z]+(?:-[a-z]+)?)/);
            return match
              ? "Mp" +
                  match[1]
                    .split("-")
                    .map((s) => s[0].toUpperCase() + s.slice(1))
                    .join("")
              : null;
          })
          .filter(Boolean)
      )
    ].slice(0, 20);

    return { buttons, inputs, tables, pixel_components: pixelComponents };
  });
}

// ── Flow config step executor ────────────────────────────────────────────────

async function executeFlowStep(page, trigger) {
  if (!trigger) return;
  const steps = trigger
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const step of steps) {
    if (step.startsWith("click-nth:")) {
      // click-nth:<selector>|<index> — clicks the index-th (0-based) match.
      // Needed for forms with several identical custom controls, e.g. a page with
      // multiple [role=combobox] selects where only the first is reachable by
      // `click:` and none carry a unique id of their own.
      // Uses Playwright's real (trusted) click, not element.click() — some design
      // systems' popovers ignore synthetic clicks, so an evaluate-based click
      // silently fails to open them.
      const rest = step.slice(10);
      const sepIdx = rest.lastIndexOf("|");
      const sel = sepIdx === -1 ? rest : rest.slice(0, sepIdx);
      const idx = sepIdx === -1 ? 0 : Number(rest.slice(sepIdx + 1)) || 0;
      await page.click(`${sel} >> nth=${idx}`, { timeout: 5000 }).catch(() => {});
    } else if (step.startsWith("click:")) {
      const sel = step.slice(6);
      await page.click(sel, { timeout: 5000 }).catch(() => {});
    } else if (step.startsWith("click-text:")) {
      const text = step.slice(11);
      await page
        .evaluate((t) => {
          const el = [...document.querySelectorAll("button, a, [role=button], .mp-button")].find(
            (e) => e.textContent?.trim() === t
          );
          if (el) el.click();
        }, text)
        .catch(() => {});
    } else if (step.startsWith("select-text:")) {
      // Broader than click-text: matches dropdown/autocomplete option rows that
      // aren't <button>/<a> (e.g. MpPopoverList items, custom <li>/<div> options).
      // Picks the innermost element whose exact trimmed text matches, so a
      // wrapping row doesn't get clicked instead of its inner label.
      const text = step.slice(12);
      await page
        .evaluate((t) => {
          const candidates = [
            ...document.querySelectorAll(
              "button, a, [role=button], [role=option], [role=menuitem], li, .mp-button, [class*='popover'], [class*='option'], [class*='item']"
            )
          ];
          const matches = candidates.filter((e) => e.textContent?.trim() === t);
          const el = matches.find(
            (e) => !matches.some((other) => other !== e && e.contains(other))
          );
          if (el || matches[0]) {
            (el || matches[0]).click();
            return;
          }
          // Fallback for multi-line option rows (e.g. an autocomplete renders the
          // label on line 1 and a secondary value on line 2, so the row's textContent
          // is "LabelPhone" and never equals the label exactly). Match rows that
          // START with the label, take the innermost, and click the row itself —
          // an inner <p> often carries no handler.
          const near = candidates.filter((e) => {
            const txt = e.textContent?.trim() ?? "";
            return txt.startsWith(t) && txt.length <= t.length + 40;
          });
          const inner = near.find((e) => !near.some((o) => o !== e && e.contains(o)));
          (inner || near[0])?.click();
        }, text)
        .catch(() => {});
    } else if (step.startsWith("type:")) {
      // type:<selector>|<text> — click the selector to focus it, then type the
      // text via real keystrokes (so autocomplete/input listeners fire), e.g.
      // "type:input[placeholder='Enter template name']|pixel_review_test".
      // If there's no "|", the whole remainder is typed into whatever already
      // has focus (use right after a click/select-text step).
      const rest = step.slice(5);
      const sepIdx = rest.indexOf("|");
      const sel = sepIdx === -1 ? null : rest.slice(0, sepIdx);
      const text = sepIdx === -1 ? rest : rest.slice(sepIdx + 1);
      try {
        if (sel) await page.click(sel, { timeout: 5000 });
        await page.keyboard.type(text, { delay: 15 });
      } catch {
        // ignore — target may not exist or may not be focusable
      }
    } else if (step.startsWith("wait:")) {
      await page.waitForTimeout(parseInt(step.slice(5), 10));
    } else if (step === "scroll") {
      // Scroll the page AND the tallest inner scroll container. An app shell that pins its
      // header and footer gives the window nothing to scroll, so `scroll` alone screenshots
      // the top of the page forever and every section below the fold reads as missing.
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
        const scrollers = Array.from(document.querySelectorAll("*")).filter((el) => {
          const cs = getComputedStyle(el);
          return /auto|scroll/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 40;
        });
        scrollers.sort((a, b) => b.scrollHeight - a.scrollHeight);
        if (scrollers[0]) scrollers[0].scrollTop = scrollers[0].scrollHeight;
      });
      await page.waitForTimeout(400);
    } else if (step.startsWith("scroll-in:")) {
      // Scroll one named container, for pages with several independent scroll panes.
      const sel = step.slice(10);
      await page.evaluate((s) => {
        const el = document.querySelector(s);
        if (el) el.scrollTop = el.scrollHeight;
      }, sel);
      await page.waitForTimeout(400);
    } else if (step.startsWith("scroll-to-text:")) {
      // Bring a section into view by its heading, which survives layout changes that a
      // pixel offset or a selector would not.
      const label = step.slice(15);
      await page.evaluate((t) => {
        const el = Array.from(document.querySelectorAll("*")).find(
          (n) => n.children.length === 0 && n.textContent.trim() === t
        );
        if (el) el.scrollIntoView({ block: "center" });
      }, label);
      await page.waitForTimeout(400);
    } else if (step === "scroll-top") {
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        document.querySelectorAll("*").forEach((el) => {
          if (el.scrollTop > 0) el.scrollTop = 0;
        });
      });
    } else if (step.startsWith("key:")) {
      await page.keyboard.press(step.slice(4)).catch(() => {});
    } else if (step.startsWith("hover-text:")) {
      // hover-text:<label> — hover a row by its exact visible text rather than a CSS
      // selector. Needed for cascading menus that open a submenu on mouseenter and give
      // the row no stable selector.
      // Uses Playwright's real mouse movement, not a synthetic MouseEvent: many frameworks'
      // @mouseenter does not bubble, so a dispatched event on an inner text node never
      // reaches a handler bound to the row wrapper.
      const text = step.slice(11);
      await page
        .getByText(text, { exact: true })
        .first()
        .hover({ timeout: 5000 })
        .catch(() => {});
    } else if (step.startsWith("click-in:")) {
      // click-in:<container-selector>|<label> — click by exact text, scoped to a
      // container. Some design systems keep every popover's content mounted whether it
      // is open or not, so an unscoped text match can hit a row inside a closed popover.
      const rest = step.slice(9);
      const sepIdx = rest.indexOf("|");
      const sel = rest.slice(0, sepIdx);
      const label = rest.slice(sepIdx + 1);
      await page
        .locator(sel)
        .getByText(label, { exact: true })
        .first()
        .click({ timeout: 5000 })
        .catch(() => {});
    } else if (step.startsWith("hover:")) {
      await page.hover(step.slice(6), { timeout: 5000 }).catch(() => {});
    } else if (step.startsWith("navigate:")) {
      const p = step.slice(9);
      const url = p.startsWith("http") ? p : origin + (p.startsWith("/") ? p : "/" + p);
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });
      } catch {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
      }
      await page.waitForTimeout(1000);
    }
  }
}

// ── Per-route interaction loop ───────────────────────────────────────────────

async function exploreRoute(page, url) {
  const states = [];

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });
  } catch {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
  }

  await page.waitForTimeout(1200);

  // Extract links BEFORE interactions (interactions may navigate away)
  const preLinks = await extractLinks(page).catch(() => []);

  const elements = await collectElements(page);

  // State: initial
  states.push({
    name: "initial",
    screenshot_b64: await screenshotB64(page),
    elements,
    interaction: "Page loaded"
  });

  // State: scrolled
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  states.push({
    name: "scrolled",
    screenshot_b64: await screenshotB64(page),
    interaction: "Scrolled to bottom"
  });
  await page.evaluate(() => window.scrollTo(0, 0));

  // State: form-filled
  const inputs = await page.$$(
    "input:not([type=hidden]):not([type=submit]):not([type=button]):not([readonly]), textarea, select"
  );
  const filledFields = [];
  for (const input of inputs.slice(0, 8)) {
    try {
      const type = (await input.getAttribute("type")) ?? "text";
      const placeholder = (await input.getAttribute("placeholder")) ?? "";
      const ariaLabel = (await input.getAttribute("aria-label")) ?? "";
      const name = (await input.getAttribute("name")) ?? "";
      const tag = await input.evaluate((el) => el.tagName.toLowerCase());

      if (tag === "select") {
        await input.selectOption({ index: 1 }).catch(() => {});
        filledFields.push("select: option 1");
      } else {
        const val = pickDummyValue(placeholder, type, ariaLabel + " " + name);
        await input.fill(val).catch(() => {});
        filledFields.push(`${placeholder || name}: "${val}"`);
      }
    } catch {
      // skip unfillable inputs
    }
  }

  if (filledFields.length > 0) {
    await page.waitForTimeout(400);
    states.push({
      name: "form-filled",
      screenshot_b64: await screenshotB64(page),
      interaction: `Filled: ${filledFields.slice(0, 3).join(", ")}`
    });
  }

  // State: after-submit (click primary button)
  const primaryBtn = await page.$(
    ".mp-button--primary, [data-variant=primary], button[type=submit]"
  );
  if (primaryBtn) {
    try {
      await primaryBtn.click();
      await page.waitForTimeout(800);
      states.push({
        name: "after-submit",
        screenshot_b64: await screenshotB64(page),
        interaction: "Clicked primary button"
      });
    } catch {
      // ignore
    }
  }

  // State: error-state (clear a required field then submit)
  const requiredInput = await page.$("input[required]:not([type=hidden])");
  if (requiredInput && primaryBtn) {
    try {
      await requiredInput.fill("");
      await primaryBtn.click();
      await page.waitForTimeout(600);
      const hasError = await page.$(".mp-form-item--error, [aria-invalid=true], .mp-alert--error");
      if (hasError) {
        states.push({
          name: "error-state",
          screenshot_b64: await screenshotB64(page),
          interaction: "Cleared required field, triggered validation error"
        });
      }
    } catch {
      // ignore
    }
  }

  // State: modal-open (click first drawer/modal trigger)
  const modalTrigger = await page.$(
    "[data-opens-modal], [aria-haspopup=dialog], .mp-button[onclick*=open], button[data-modal]"
  );
  if (!modalTrigger) {
    // Fallback: look for buttons labelled "Add", "New", "Create", "Buat", "Tambah"
    const addBtn = await page.$$eval("button, .mp-button", (els) => {
      const add = els.find((el) =>
        /^(add|new|create|buat|tambah)\b/i.test(el.textContent?.trim() ?? "")
      );
      return add ? true : false;
    });

    if (addBtn) {
      const btn = await page.evaluateHandle(() =>
        Array.from(document.querySelectorAll("button, .mp-button")).find((el) =>
          /^(add|new|create|buat|tambah)\b/i.test(el.textContent?.trim() ?? "")
        )
      );
      try {
        await btn.asElement()?.click();
        await page.waitForTimeout(800);
        const overlay = await page.$(".mp-drawer, .mp-modal, [role=dialog]");
        if (overlay) {
          states.push({
            name: "modal-open",
            screenshot_b64: await screenshotB64(page),
            interaction: "Clicked Add/New/Create button, drawer/modal opened"
          });
          // close it
          const closeBtn = await overlay.$(
            "button[aria-label*=close], button[aria-label*=Close], .mp-button--text"
          );
          if (closeBtn) await closeBtn.click().catch(() => {});
          else await page.keyboard.press("Escape");
          await page.waitForTimeout(400);
        }
      } catch {
        // ignore
      }
    }
  }

  // State: tab-switched (click second tab)
  const tabs = await page.$$("[role=tab], .mp-tabs__item");
  if (tabs.length >= 2) {
    try {
      await tabs[1].click();
      await page.waitForTimeout(500);
      states.push({
        name: "tab-switched",
        screenshot_b64: await screenshotB64(page),
        interaction: "Switched to second tab"
      });
    } catch {
      // ignore
    }
  }

  return { states, preLinks };
}

// ── Main ────────────────────────────────────────────────────────────────────

(async () => {
  const chromeProfile = path.join(os.homedir(), "Library/Application Support/Google/Chrome");
  const tempProfile = path.join(os.tmpdir(), "pw-pixel-review-profile");

  let userDataDir;
  if (!useProfile) {
    userDataDir = path.join(os.tmpdir(), "pw-pixel-review-fresh");
  } else if (isChromeRunning()) {
    console.log("  ℹ️  Chrome is running — copying profile to temp dir...");
    copyProfileToTemp(chromeProfile, tempProfile);
    userDataDir = tempProfile;
  } else {
    userDataDir = chromeProfile;
  }

  console.log(`\n🎭 Pixel Review — Playwright Explorer`);
  console.log(`   URL: ${prototypeUrl}`);
  console.log(`   Profile: ${useProfile ? "Chrome (existing session)" : "Fresh (no session)"}\n`);

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: useProfile ? "chrome" : undefined,
    headless: true,
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true
  });

  const page = await context.newPage();

  if (localStorageSeed) {
    await page.addInitScript((seed) => {
      try {
        for (const [k, v] of Object.entries(seed)) window.localStorage.setItem(k, v);
      } catch {
        /* private mode or blocked storage — the run continues without the seed */
      }
    }, localStorageSeed);
    console.log(`  🔑 localStorage seeded: ${Object.keys(localStorageSeed).join(", ")}\n`);
  }

  const screens = [];
  const errors = [];

  if (flowConfig) {
    // Flow config mode: PRD-driven state map, no generic exploration
    console.log(`  📋 Flow config mode — ${flowConfig.length} state(s)\n`);
    let lastRoute = null;
    let routeElements = null;

    for (let i = 0; i < flowConfig.length; i++) {
      const entry = flowConfig[i];
      const routePath = entry.route.startsWith("/") ? entry.route : "/" + entry.route;
      const url = origin + routePath;
      const usLabel = entry.us?.length ? ` (${entry.us.join(", ")})` : "";
      console.log(`  🎬 [${i + 1}/${flowConfig.length}] ${routePath} › ${entry.state}${usLabel}`);

      try {
        if (routePath !== lastRoute) {
          try {
            await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });
          } catch {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
          }
          await page.waitForTimeout(1200);
          routeElements = await collectElements(page);
          lastRoute = routePath;
        }

        if (entry.trigger) {
          await executeFlowStep(page, entry.trigger);
          await page.waitForTimeout(300);
        }

        const screenshot = await screenshotB64(page);
        const title = await page.title();

        let screen = screens.find((s) => s.route === routePath);
        if (!screen) {
          screen = { route: routePath, title, us: [], states: [] };
          screens.push(screen);
        }
        if (entry.us) screen.us = [...new Set([...screen.us, ...entry.us])];

        screen.states.push({
          name: entry.state,
          us: entry.us || [],
          screenshot_b64: screenshot,
          elements: routeElements,
          interaction: entry.trigger || "Page loaded"
        });
      } catch (err) {
        errors.push({ route: routePath, state: entry.state, error: String(err) });
        console.error(`     ⚠️  Error: ${err.message}`);
      }
    }
  } else if (targetRoutes) {
    // Targeted mode: visit only the specified routes, generic exploration
    console.log(`  🎯 Targeted mode — ${targetRoutes.length} route(s)\n`);
    for (let i = 0; i < targetRoutes.length; i++) {
      const routePath = targetRoutes[i].startsWith("/") ? targetRoutes[i] : "/" + targetRoutes[i];
      const url = origin + routePath;
      console.log(`  📄 [${i + 1}/${targetRoutes.length}] ${routePath}`);
      try {
        const { states } = await exploreRoute(page, url);
        const title = await page.title();
        screens.push({ route: routePath, title, states });
      } catch (err) {
        errors.push({ route: routePath, error: String(err) });
        console.error(`     ⚠️  Error on ${routePath}: ${err.message}`);
      }
    }
  } else {
    // BFS mode: discover routes up to maxRoutes
    const visited = new Set();
    const queue = [prototypeUrl];

    while (queue.length > 0 && visited.size < maxRoutes) {
      const url = queue.shift();
      if (!url || visited.has(url)) continue;
      visited.add(url);

      const routePath = url.replace(origin, "") || "/";
      console.log(`  📄 [${visited.size}/${maxRoutes}] ${routePath}`);

      try {
        const { states, preLinks } = await exploreRoute(page, url);
        const title = await page.title();

        screens.push({ route: routePath, title, states });

        for (const link of preLinks) {
          const full = origin + link;
          if (!visited.has(full) && !queue.includes(full)) {
            queue.push(full);
          }
        }
      } catch (err) {
        errors.push({ route: routePath, error: String(err) });
        console.error(`     ⚠️  Error on ${routePath}: ${err.message}`);
      }
    }
  }

  await context.close();

  const result = {
    url: prototypeUrl,
    timestamp: new Date().toISOString(),
    routes_discovered: screens.length,
    screens,
    errors
  };

  const outPath = path.join(outDir, "result.json");
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));

  console.log(`\n✅ Done. ${screens.length} screens captured.`);
  console.log(`   Output: ${outPath}\n`);
})();
