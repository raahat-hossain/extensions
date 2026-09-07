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
  console.log("CloudflareError OK", error.resolutionURL);
}

const source = new HentaiRead();
const cfg = source.getConfiguration() as {
  cloudflareResolutionURL?: string;
  useClientForImageRequests?: boolean;
};
if (cfg.cloudflareResolutionURL !== NESTED) {
  throw new Error(`bad resolution url: ${JSON.stringify(cfg)}`);
}
if (!cfg.useClientForImageRequests) {
  throw new Error("useClientForImageRequests required per docs");
}
if (HentaiRead.info.version < 1.9) {
  throw new Error(`expected >= 1.9, got ${HentaiRead.info.version}`);
}

const src = readFileSync("src/sources/hentairead/index.ts", "utf8");
if (!/^["']use httpclient["']/m.test(src)) {
  throw new Error("hentairead must use httpclient (documented CF path)");
}
if (!(source as { client?: unknown }).client) {
  throw new Error("missing this.client HttpClient");
}
console.log("hentairead config OK", cfg.cloudflareResolutionURL, "v" + HentaiRead.info.version);

const main = async () => {
  const home = await source.getHomePage();
  console.log("homepage feeds OK", home.feeds?.map((f) => f.id).join(","));

  try {
    await source.getItemList({ key: "latest" }, 1);
    console.log("WARNING: listing succeeded (no CF from this IP?)");
  } catch (error) {
    if (!(error instanceof CloudflareError)) throw error;
    console.log("listing CF OK", error.resolutionURL ?? "(native)");
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
