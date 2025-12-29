import crypto from "crypto";

const TENANT_SLUG = process.env.TENANT_SLUG || process.argv[2];
const EXTERNAL_USER_ID = process.env.EXTERNAL_USER_ID || process.argv[3];
const SIGNING_SECRET = process.env.REFERRALOS_SIGNING_SECRET;
const BASE_URL = process.env.REFERRALOS_BASE_URL || "http://localhost:3000";

function generateEmbedSignature(
  tenant: string,
  externalUserId: string,
  timestamp: number,
  secret: string
): string {
  const message = `${tenant}.${externalUserId}.${timestamp}`;
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

function main() {
  console.log("============================================================");
  console.log("ReferralOS Embed Link Generator");
  console.log("============================================================\n");

  if (!TENANT_SLUG) {
    console.error("Error: TENANT_SLUG is required");
    console.error("Usage: TENANT_SLUG=<slug> EXTERNAL_USER_ID=<id> tsx execution/gen_embed_link.ts");
    console.error("   or: tsx execution/gen_embed_link.ts <tenant_slug> <external_user_id>");
    process.exit(1);
  }

  if (!EXTERNAL_USER_ID) {
    console.error("Error: EXTERNAL_USER_ID is required");
    console.error("Usage: TENANT_SLUG=<slug> EXTERNAL_USER_ID=<id> tsx execution/gen_embed_link.ts");
    console.error("   or: tsx execution/gen_embed_link.ts <tenant_slug> <external_user_id>");
    process.exit(1);
  }

  if (!SIGNING_SECRET) {
    console.error("Error: REFERRALOS_SIGNING_SECRET environment variable is required");
    process.exit(1);
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = generateEmbedSignature(TENANT_SLUG, EXTERNAL_USER_ID, timestamp, SIGNING_SECRET);

  const params = new URLSearchParams({
    tenant: TENANT_SLUG,
    externalUserId: EXTERNAL_USER_ID,
    ts: timestamp.toString(),
    sig: signature,
  });

  const embedUrl = `${BASE_URL}/embed/referral?${params.toString()}`;

  console.log("Parameters:");
  console.log(`  Tenant:          ${TENANT_SLUG}`);
  console.log(`  External User:   ${EXTERNAL_USER_ID}`);
  console.log(`  Timestamp:       ${timestamp} (${new Date(timestamp * 1000).toISOString()})`);
  console.log(`  Signature:       ${signature.substring(0, 16)}...`);
  console.log("");
  console.log("Embed URL (valid for 10 minutes):");
  console.log(embedUrl);
  console.log("");
  console.log("iframe snippet:");
  console.log(`<iframe
  src="${embedUrl}"
  width="100%"
  height="500"
  frameborder="0"
  allow="clipboard-write"
  title="Referral Program"
></iframe>`);
  console.log("");
  console.log("============================================================");
}

main();
