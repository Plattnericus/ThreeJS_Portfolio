import { chromium } from "playwright-core";

const OUT = "/private/tmp/claude-501/-Users-nexor-Github-ThreeJS-Portfolio/4cef71f8-de98-424e-abda-254695ce8996/scratchpad";
const BASE = "http://localhost:3000";

const views = [
  { name: "golden-hour", q: "?hour=19&sky=clear" },
  { name: "noon-dappled", q: "?hour=12&sky=clear" },
  { name: "low-sun", q: "?hour=8&sky=clear" },
  { name: "storm", q: "?sky=storm&hour=15" },
  { name: "rain", q: "?sky=rain&hour=14" },
  { name: "snow", q: "?sky=snow&hour=11" },
  { name: "night", q: "?hour=23&sky=clear" },
];

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

async function waitReady(page, name) {
  try {
    await page.waitForFunction(
      () => !document.querySelector(".loader-percent"),
      { timeout: 90000 },
    );
  } catch {
    console.log(`  ${name}: loader still present after 90s`);
  }
  await page.waitForTimeout(3500);
}

async function snap(page, name) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.screenshot({ path: `${OUT}/${name}.png` });
      console.log(`  saved ${name}.png`);
      return;
    } catch (e) {
      console.log(`  ${name} screenshot retry ${attempt}: ${e.message.split("\n")[0]}`);
      await page.waitForTimeout(1500);
    }
  }
}

async function run(ctxOpts, list, prefix, extra) {
  const ctx = await browser.newContext(ctxOpts);
  await ctx.addInitScript(() => {
    try { localStorage.setItem("star-tree-graphics-quality", "high"); } catch {}
  });
  for (const v of list) {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/${v.q}`, { waitUntil: "domcontentloaded" });
    await waitReady(page, `${prefix}-${v.name}`);
    await snap(page, `${prefix}-${v.name}`);
    if (extra) await extra(page, v);
    await page.close();
  }
  await ctx.close();
}

await run({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }, views, "desk");

await run(
  { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  [{ name: "portrait", q: "?hour=17&sky=clear" }],
  "mobile",
  async (page) => {
    try {
      await page.mouse.click(360, 48);
      await page.waitForTimeout(1400);
      await snap(page, "mobile-menu");
    } catch (e) { console.log("menu tap failed", e.message); }
  },
);

await run(
  { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  [{ name: "landscape", q: "?hour=17&sky=clear" }],
  "mobile",
);

await browser.close();
console.log("done");
