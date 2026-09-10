#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
YUZONO="${YUZONO_DIR:-$ROOT/.ref/yuzono}"
ANDROID_SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/android-sdk}}"

if [[ ! -d "$YUZONO/gradle/build-logic" ]]; then
  echo "Yuzono host missing at $YUZONO" >&2
  echo "git clone --depth 1 https://github.com/yuzono/cursed-manga-extensions.git $YUZONO" >&2
  exit 1
fi

if [[ ! -d "$ANDROID_SDK/platforms" ]]; then
  echo "Android SDK not found at $ANDROID_SDK" >&2
  exit 1
fi

export ANDROID_HOME="$ANDROID_SDK"
export ANDROID_SDK_ROOT="$ANDROID_SDK"

rm -rf "$YUZONO/src/all/r2merge"
cp -a "$ROOT/mihon/src/all/r2merge" "$YUZONO/src/all/r2merge"

if [[ -d "$YUZONO/.git" ]]; then
  git -C "$YUZONO" checkout -- settings.gradle.kts >/dev/null 2>&1 || true
fi

python3 - "$YUZONO/settings.gradle.kts" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text()
text = text.replace(
    'loadAllIndividualExtensions()\n// loadIndividualExtension("all", "mangadex")',
    '// loadAllIndividualExtensions()\nloadIndividualExtension("all", "r2merge")',
    1,
)
# Skip unused lib modules so Gradle only configures core + this extension.
text = text.replace(
    'File(rootDir, "lib").eachDir { include("lib:${it.name}") }',
    '// File(rootDir, "lib").eachDir { include("lib:${it.name}") }',
)
text = text.replace(
    'File(rootDir, "lib-multisrc").eachDir { include("lib-multisrc:${it.name}") }',
    '// File(rootDir, "lib-multisrc").eachDir { include("lib-multisrc:${it.name}") }',
)
path.write_text(text)
PY

printf 'sdk.dir=%s\n' "$ANDROID_SDK" > "$YUZONO/local.properties"

(
  cd "$YUZONO"
  ./gradlew :src:all:r2merge:assembleRelease --no-daemon --stacktrace
)

mkdir -p "$ROOT/repo/apk"
find "$YUZONO/src/all/r2merge/build/outputs/apk" -name 'tachiyomi-all.r2merge-*.apk' -exec cp {} "$ROOT/repo/apk/" \;

python3 - "$ROOT" <<'PY'
import glob, json, os, sys
root = sys.argv[1]
apks = glob.glob(os.path.join(root, "repo/apk/tachiyomi-all.r2merge-*.apk"))
if not apks:
    raise SystemExit("no apk produced")
apk_path = max(apks, key=os.path.getmtime)
apk = os.path.basename(apk_path)
version = apk.removeprefix("tachiyomi-all.r2merge-v").removesuffix(".apk")
code = int(version.split(".")[-1])
index = [{
    "name": "Tachiyomi: R2 Merge",
    "pkg": "eu.kanade.tachiyomi.extension.all.r2merge",
    "apk": apk,
    "lang": "all",
    "code": code,
    "version": version,
    "nsfw": 1,
    "sources": [{
        "name": "R2 Merge",
        "lang": "all",
        "id": "8210462026091001",
        "baseUrl": "https://developers.cloudflare.com",
    }],
}]
os.makedirs(os.path.join(root, "repo"), exist_ok=True)
with open(os.path.join(root, "repo/index.min.json"), "w") as fh:
    json.dump(index, fh, separators=(",", ":"))
with open(os.path.join(root, "repo/index.json"), "w") as fh:
    json.dump(index, fh, indent=2)
    fh.write("\n")
print("wrote", apk, "version", version)
PY
