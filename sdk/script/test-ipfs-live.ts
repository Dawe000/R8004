/**
 * Live IPFS test: upload via Pinata and verify round-trip via fetchFromIpfs.
 * Run: npx tsx script/test-ipfs-live.ts
 * Requires: PINATA_JWT in .env
 */
import "dotenv/config";
import { uploadJson, uploadText, fetchFromIpfs } from "../src/ipfs";

async function main() {
  const jwt = process.env.PINATA_JWT;
  if (!jwt?.trim()) {
    console.error("PINATA_JWT not set in .env - skipping live IPFS test");
    process.exit(1);
  }

  const config = { provider: "pinata" as const, apiKey: jwt.trim() };
  console.log("Testing IPFS uploads via Pinata...\n");

  // 1. uploadJson round-trip
  const testJson = { task: "test", desc: "IPFS live test", ts: Date.now() };
  const uriJson = await uploadJson(testJson, config);
  console.log("uploadJson URI:", uriJson);

  // Pinata gateway - content we pin is reliably served there
  const gateway = "https://gateway.pinata.cloud/ipfs/";
  const fetchedJson = await fetchFromIpfs(uriJson, { gateway, asJson: true });
  const okJson =
    JSON.stringify(fetchedJson) === JSON.stringify(testJson);
  console.log("fetchFromIpfs round-trip JSON:", okJson ? "OK" : "FAIL");
  if (!okJson) console.log("  Expected:", testJson, "Got:", fetchedJson);

  // 2. uploadText round-trip
  const testText = "Build me a todo app - IPFS live test " + Date.now();
  const uriText = await uploadText(testText, config);
  console.log("uploadText URI:", uriText);

  const fetchedText = (await fetchFromIpfs(uriText, { gateway })) as string;
  const okText = fetchedText === testText;
  console.log("fetchFromIpfs round-trip text:", okText ? "OK" : "FAIL");
  if (!okText) console.log("  Expected:", testText, "Got:", fetchedText);

  if (okJson && okText) {
    console.log("\n✓ All IPFS live tests passed");
  } else {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
