const CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const BASE = BigInt(CHARS.length);

/**
 * Encodes a unique integer ID into a Base62 string.
 */
export function encodeToBase62(num: bigint | number): string {
  let val = typeof num === "bigint" ? num : BigInt(num);
  if (val === 0n) return CHARS[0];

  let result = "";
  while (val > 0n) {
    const remainder = val % BASE;
    result = CHARS[Number(remainder)] + result;
    val = val / BASE;
  }
  return result;
}

/**
 * Decodes a Base62 string back to a bigint ID.
 */
export function decodeFromBase62(str: string): bigint {
  let val = 0n;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const index = CHARS.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid Base62 character: ${char}`);
    }
    val = val * BASE + BigInt(index);
  }
  return val;
}
