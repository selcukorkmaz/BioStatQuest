// Render /public/og-image.svg → /public/og-image.png (1200x630).
// Run with: npm run og
// Social-media scrapers (Twitter, LinkedIn, Slack, Discord, Facebook)
// overwhelmingly prefer raster images for OG preview cards. The SVG is the
// editable source; the PNG is what we ship. Re-run after editing the SVG.

import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { resolve } from "node:path";

const root = resolve(new URL(".", import.meta.url).pathname, "..");
const svgPath = resolve(root, "public/og-image.svg");
const pngPath = resolve(root, "public/og-image.png");

const svg = readFileSync(svgPath, "utf8");
const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: 1200 },
  font: {
    // Use bundled defaults; for pixel-identical rendering install Inter locally.
    loadSystemFonts: true,
  },
  background: "#05070f",
});
const out = resvg.render().asPng();
writeFileSync(pngPath, out);
console.log(`✓ wrote ${pngPath} (${(out.length / 1024).toFixed(1)} KB)`);
