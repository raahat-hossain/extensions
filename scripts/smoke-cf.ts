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

const NESTED = "https://hentairead.com/hentai/?sortby=new";

try {
  throwCloudflare(NESTED);
} catch (error) {
  if (!(error instanceof CloudflareError)) throw error;
  if (error.resolutionURL !== NESTED) throw new Error("url");
  console.log("CloudflareError OK", error.resolutionURL);
}

const source = new HentaiRead();
const cfg = source.getConfiguration() as {
  cloudflareResolutionURL?: string;
};
if (cfg.cloudflareResolutionURL !== NESTED) {
  throw new Error(`missing nested resolution url: ${JSON.stringify(cfg)}`);
}
if (HentaiRead.info.version < 1.7) {
  throw new Error(`expected version >= 1.7, got ${HentaiRead.info.version}`);
}

const src = readFileSync("src/sources/hentairead/index.ts", "utf8");
if (/^["']use httpclient["']/m.test(src)) {
  throw new Error("hentairead must not use httpclient (NetworkClient required)");
}
if (!src.includes("createNetworkClient")) {
  throw new Error("hentairead must use createNetworkClient");
}
if (!src.includes("/hentai/?sortby=new")) {
  throw new Error("hentairead must resolve CF on nested /hentai/ path");
}
console.log("hentairead config OK", cfg.cloudflareResolutionURL, "v" + HentaiRead.info.version);

const main = async () => {
  try {
    await source.getHomePage();
    console.log("WARNING: homepage unexpectedly succeeded (no CF from this IP?)");
  } catch (error) {
    if (!(error instanceof CloudflareError)) throw error;
    if (error.resolutionURL !== NESTED) {
      throw new Error(`expected nested resolve url, got: ${error.resolutionURL}`);
    }
    console.log("homepage CF throw OK (nested)", error.resolutionURL);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
