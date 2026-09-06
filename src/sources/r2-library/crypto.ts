export const bytesToBase64 = (bytes: Uint8Array): string => {
  const chunk = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
};

const textEncoder = new TextEncoder();

export const toBytes = (value: string | Uint8Array): Uint8Array =>
  typeof value === "string" ? textEncoder.encode(value) : value;

export const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

export const sha256Hex = (value: string | Uint8Array): string =>
  toHex(Crypto.sha256(toBytes(value)));

export const hmacSha256 = (
  key: string | Uint8Array,
  message: string | Uint8Array,
): Uint8Array => {
  const blockSize = 64;
  let keyBytes = toBytes(key);
  if (keyBytes.length > blockSize) {
    keyBytes = Crypto.sha256(keyBytes);
  }

  const keyed = new Uint8Array(blockSize);
  keyed.set(keyBytes);

  const ipad = new Uint8Array(blockSize);
  const opad = new Uint8Array(blockSize);
  for (let index = 0; index < blockSize; index += 1) {
    ipad[index] = keyed[index]! ^ 0x36;
    opad[index] = keyed[index]! ^ 0x5c;
  }

  const messageBytes = toBytes(message);
  const inner = new Uint8Array(blockSize + messageBytes.length);
  inner.set(ipad);
  inner.set(messageBytes, blockSize);

  const outer = new Uint8Array(blockSize + 32);
  outer.set(opad);
  outer.set(Crypto.sha256(inner), blockSize);
  return Crypto.sha256(outer);
};

export const hmacSha256Hex = (
  key: string | Uint8Array,
  message: string | Uint8Array,
): string => toHex(hmacSha256(key, message));
