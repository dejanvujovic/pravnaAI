/**
 * Debug skripta: parsiraj PDF i ispiši prvih 1000 karaktera teksta,
 * pa pokreni analyze() i ispiši rezultat. Koristi se za podešavanje
 * regex-a za detekciju naslova.
 */
import { readFile } from "node:fs/promises";
import { parseFile } from "../src/services/parser.js";
import { analyze } from "../src/services/analyzer.js";

const PUTANJA = process.argv[2];
if (!PUTANJA) {
  console.error("Upotreba: tsx scripts/probe-analyze.ts <putanja-do-pdf>");
  process.exit(1);
}

const buf = await readFile(PUTANJA);
const parsed = await parseFile(buf, "application/pdf", "test.pdf");

console.log("=== PRVIH 1200 KARAKTERA TEKSTA ===");
console.log(JSON.stringify(parsed.tekst.slice(0, 1200)));
console.log();
console.log("=== ANALYZE REZULTAT ===");
console.log(JSON.stringify(analyze(parsed.tekst), null, 2));
