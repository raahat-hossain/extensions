/** Runtime globals provided by Suwatte / the toolchain emulator. */
declare const Crypto: {
  md5(data: Uint8Array | string): Uint8Array;
  sha256(data: Uint8Array | string): Uint8Array;
  aesDecrypt(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array;
};
