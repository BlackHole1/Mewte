const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(value, "base64"));
}

/**
 * A new row id: UUID v7. Its leading bits are the creation time, so ids sort in the
 * order they were made and stay close together in a database index.
 */
export function newId(): string {
  return Bun.randomUUIDv7();
}

export function randomToken(bytes = 32): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("base64url");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Buffer.from(digest).toString("hex");
}

/** Compares two strings without leaking where they differ. */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

export interface Cipher {
  encrypt(plaintext: string): Promise<string>;
  decrypt(payload: string): Promise<string>;
}

const VERSION = "v1";

/**
 * AES-256-GCM with a key derived from the configured secret. Output is
 * `v1:<iv>:<ciphertext>`, so the scheme can change later without guessing.
 */
export async function createCipher(secret: string): Promise<Cipher> {
  if (secret.length < 32) throw new Error("The secret key must be at least 32 characters long");
  const material = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, [
    "deriveKey",
  ]);
  const key = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("mewte"),
      info: encoder.encode("token-encryption"),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  return {
    async encrypt(plaintext) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const data = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        encoder.encode(plaintext),
      );
      return `${VERSION}:${toBase64(iv)}:${toBase64(new Uint8Array(data))}`;
    },
    async decrypt(payload) {
      const [version, iv, data] = payload.split(":");
      if (version !== VERSION || !iv || !data) throw new Error("Unrecognised ciphertext format");
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: fromBase64(iv) },
        key,
        fromBase64(data),
      );
      return decoder.decode(plain);
    },
  };
}
