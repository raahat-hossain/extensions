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
if (HentaiRead.info.version < 1.8) {
  throw new Error(`expected version >= 1.8, got ${HentaiRead.info.version}`);
}

const src = readFileSync("src/sources/hentairead/index.ts", "utf8");
if (/^["']use httpclient["']/m.test(src)) {
  throw new Error("hentairead must not use httpclient (NetworkClient required)");
}
if (!src.includes("getSettingsPage")) {
  throw new Error("hentairead must expose getSettingsPage");
}
console.log("hentairead config OK", cfg.cloudflareResolutionURL, "v" + HentaiRead.info.version);

const main = async () => {
  const settings = await source.getSettingsPage();
  if (!settings.sections?.length) throw new Error("empty settings");
  console.log("settings OK", settings.sections[0]?.header);

  // Homepage should NOT throw CF anymore (Availability abort workaround).
  const home = await source.getHomePage();
  if (!home.feeds?.length) throw new Error("no feeds");
  console.log("homepage feeds OK", home.feeds.map((f) => f.id).join(","));

  // Listing should still surface CF with nested Resolve URL.
  try {
    await source.getItemList({ key: "latest" }, 1);
    console.log("WARNING: listing unexpectedly succeeded (no CF from this IP?)");
  } catch (error) {
    if (!(error instanceof CloudflareError)) throw error;
    if (error.resolutionURL !== NESTED) {
      throw new Error(`expected nested resolve url, got: ${error.resolutionURL}`);
    }
    console.log("listing CF throw OK (nested)", error.resolutionURL);
  }

  // Force-resolve setting should make homepage throw CF.
  await ObjectStore.set("force_cf_resolve", true);
  try {
    await source.getHomePage();
    throw new Error("force resolve did not throw");
  } catch (error) {
    if (!(error instanceof CloudflareError)) throw error;
    console.log("force resolve OK", error.resolutionURL);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
