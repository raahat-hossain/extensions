/**
 * Live probe against an R2 bucket using the library client.
 *
 *   R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=manga \
 *     npx tsx scripts/probe-r2-live.ts
 */
import { installEmulatorGlobals } from "@suwatte/toolchain/emulator";

const main = async () => {
  installEmulatorGlobals();

  const { signRequest } = await import("../src/sources/r2-library/aws4.ts");
  const { listAll } = await import("../src/sources/r2-library/r2.ts");
  type R2Config = import("../src/sources/r2-library/config.ts").R2Config;

  const accountId = process.env.R2_ACCOUNT_ID ?? "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? "";
  const bucket = process.env.R2_BUCKET ?? "manga";

  if (!accountId || !accessKeyId || !secretAccessKey) {
    console.error("Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY");
    process.exit(1);
  }

  const config: R2Config = {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    prefix: "",
  };

  const signed = signRequest({
    method: "GET",
    endpoint: config.endpoint,
    bucket: config.bucket,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    query: { "list-type": "2", "max-keys": "5", prefix: "", delimiter: "/" },
    expiresSeconds: 300,
  });
  console.log("presigned list url ok:", signed.url.includes("X-Amz-Signature="));

  const atRoot = await listAll(config, "", "/");
  console.log(
    "root CommonPrefixes:",
    atRoot.prefixes.length,
    atRoot.prefixes.slice(0, 12),
  );

  const underManga = await listAll(config, "manga/", "/");
  console.log("manga/ CommonPrefixes:", underManga.prefixes.length);

  if (!atRoot.prefixes.length) {
    console.error("FAIL: expected title folders at bucket root");
    process.exit(1);
  }

  console.log("probe ok");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
