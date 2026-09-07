import {
  installEmulatorGlobals,
  CloudflareError,
} from "@suwatte/toolchain/emulator";
import {
  looksLikeCloudflare,
  originOf,
  throwCloudflare,
} from "../src/sources/_shared/cloudflare.ts";
import HentaiRead from "../src/sources/hentairead/index.ts";
import { readFileSync } from "node:fs";

installEmulatorGlobals();

if (!looksLikeCloudflare("Just a moment... cf-chl")) throw new Error("detect fail");
if (originOf("https://hentairead.com/hentai/?x=1") !== "https://hentairead.com/") {
  throw new Error("origin fail");
}

try {
  throwCloudflare("https://hentairead.com/");
} catch (error) {
  if (!(error instanceof CloudflareError)) throw error;
  if (error.resolutionURL !== "https://hentairead.com/") throw new Error("url");
  console.log("CloudflareError OK", error.resolutionURL);
}

const source = new HentaiRead();
const cfg = source.getConfiguration() as {
  cloudflareResolutionURL?: string;
};
if (cfg.cloudflareResolutionURL !== "https://hentairead.com/") {
  throw new Error(`missing resolution url: ${JSON.stringify(cfg)}`);
}
if (HentaiRead.info.version < 1.6) {
  throw new Error(`expected version >= 1.6, got ${HentaiRead.info.version}`);
}

const src = readFileSync("src/sources/hentairead/index.ts", "utf8");
if (/^["']use httpclient["']/m.test(src)) {
  throw new Error("hentairead must not use httpclient (NetworkClient required)");
}
if (!src.includes("createNetworkClient")) {
  throw new Error("hentairead must use createNetworkClient");
}
console.log("hentairead config OK", cfg.cloudflareResolutionURL, "v" + HentaiRead.info.version);

const main = async () => {
  try {
    await source.getHomePage();
    console.log("WARNING: homepage unexpectedly succeeded (no CF from this IP?)");
  } catch (error) {
    if (!(error instanceof CloudflareError)) throw error;
    if (error.resolutionURL !== "https://hentairead.com/") {
      throw new Error(`bad resolution url on throw: ${error.resolutionURL}`);
    }
    console.log("homepage CF throw OK", error.resolutionURL);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
