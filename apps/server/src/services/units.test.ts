import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadConfig } from "../config";
import { createCipher, newId, randomToken, sha256Hex, timingSafeEqual } from "./crypto";
import { argon2Hasher } from "./password";
import { resolveSecretKey } from "./secret-key";
import {
  currentTotp,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  normalizeRecoveryCode,
  verifyTotp,
} from "./totp";

const SECRET = "0123456789abcdef0123456789abcdef";

describe("crypto", () => {
  it("round-trips and never repeats a ciphertext", async () => {
    const cipher = await createCipher(SECRET);
    const first = await cipher.encrypt("ghp_token");
    const second = await cipher.encrypt("ghp_token");
    expect(first).toMatch(/^v1:/);
    expect(first).not.toBe(second);
    expect(first).not.toContain("ghp_token");
    expect(await cipher.decrypt(first)).toBe("ghp_token");
    expect(await cipher.decrypt(second)).toBe("ghp_token");
  });

  it("rejects tampering, other keys and unknown formats", async () => {
    const cipher = await createCipher(SECRET);
    const payload = await cipher.encrypt("secret");
    const [version, iv, data] = payload.split(":");
    const flipped = Buffer.from(data!, "base64");
    flipped[0] = flipped[0]! ^ 1;
    await expect(
      cipher.decrypt(`${version}:${iv}:${flipped.toString("base64")}`),
    ).rejects.toThrow();
    await expect((await createCipher(`${SECRET}x`)).decrypt(payload)).rejects.toThrow();
    await expect(cipher.decrypt("v2:a:b")).rejects.toThrow(/format/);
    await expect(cipher.decrypt("garbage")).rejects.toThrow(/format/);
  });

  it("refuses short keys", async () => {
    await expect(createCipher("short")).rejects.toThrow(/32 characters/);
  });

  it("hashes and compares", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(await timingSafeEqual("same", "same")).toBe(true);
    expect(await timingSafeEqual("same", "other")).toBe(false);
    expect(await timingSafeEqual("", "x")).toBe(false);
    expect(randomToken()).not.toBe(randomToken());
    expect(randomToken(16)).toMatch(/^[\w-]{22}$/);
  });
});

describe("password hashing", () => {
  it("uses argon2id and verifies", async () => {
    const hash = await argon2Hasher.hash("hunter2hunter2");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await argon2Hasher.verify("hunter2hunter2", hash)).toBe(true);
    expect(await argon2Hasher.verify("wrong", hash)).toBe(false);
    expect(await argon2Hasher.verify("x", "not-a-hash")).toBe(false);
  });
});

describe("totp", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");

  it("generates a scannable secret", () => {
    const { secret, otpauthUrl } = generateTotpSecret("admin");
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(otpauthUrl).toContain("otpauth://totp/Mewte:admin");
    expect(otpauthUrl).toContain(`secret=${secret}`);
  });

  it("accepts the current code and one step of drift", () => {
    const { secret } = generateTotpSecret("admin");
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(secret, currentTotp(secret, now), now)).toBe(step);
    expect(verifyTotp(secret, currentTotp(secret, now - 30_000), now)).toBe(step - 1);
    expect(verifyTotp(secret, currentTotp(secret, now + 30_000), now)).toBe(step + 1);
    expect(verifyTotp(secret, currentTotp(secret, now - 90_000), now)).toBeNull();
  });

  it("rejects malformed codes", () => {
    const { secret } = generateTotpSecret("admin");
    expect(verifyTotp(secret, "12345", now)).toBeNull();
    expect(verifyTotp(secret, "abcdef", now)).toBeNull();
    expect(verifyTotp(secret, "1234567", now)).toBeNull();
  });

  it("generates distinct recovery codes stored only as hashes", async () => {
    const { codes, records } = await generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);
    expect(records[0]?.codeHash).toBe(await hashRecoveryCode(codes[0]!));
    expect(records[0]?.codeHash).toHaveLength(64);
    expect(JSON.stringify(records)).not.toContain(codes[0]);
  });

  it("normalises recovery codes before hashing", async () => {
    expect(normalizeRecoveryCode("  ABCDE-FGHJK \n")).toBe("abcde-fghjk");
    expect(await hashRecoveryCode("ABCDE-FGHJK ")).toBe(await hashRecoveryCode("abcde-fghjk"));
  });
});

describe("secret key resolution", () => {
  const dir = mkdtempSync(join(tmpdir(), "mewte-key-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("prefers SECRET_KEY", () => {
    expect(resolveSecretKey({ secretKey: SECRET, kind: "postgres", dataDir: dir })).toEqual({
      secret: SECRET,
      source: "env",
    });
  });

  it("requires SECRET_KEY for networked databases", () => {
    expect(() =>
      resolveSecretKey({ secretKey: undefined, kind: "postgres", dataDir: dir }),
    ).toThrow(/SECRET_KEY/);
    expect(() => resolveSecretKey({ secretKey: undefined, kind: "mysql", dataDir: dir })).toThrow(
      /SECRET_KEY/,
    );
  });

  it("generates a private key file for SQLite and reuses it", () => {
    const nested = join(dir, "nested");
    const first = resolveSecretKey({ secretKey: undefined, kind: "sqlite", dataDir: nested });
    expect(first.source).toBe("generated");
    expect(first.secret.length).toBeGreaterThanOrEqual(32);
    expect(statSync(join(nested, "secret.key")).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(nested, "secret.key"), "utf8").trim()).toBe(first.secret);
    expect(resolveSecretKey({ secretKey: undefined, kind: "sqlite", dataDir: nested })).toEqual({
      secret: first.secret,
      source: "file",
    });
  });
});

describe("config", () => {
  it("applies defaults", () => {
    expect(loadConfig({})).toMatchObject({
      databaseUrl: "sqlite://./data/mewte.db",
      dataDir: "./data",
      host: "0.0.0.0",
      port: 3000,
      secretKey: undefined,
      setupToken: undefined,
      trustProxy: false,
      cookieSecure: "auto",
      githubApiUrl: "https://api.github.com",
    });
  });

  it("treats blank values as unset", () => {
    expect(
      loadConfig({ PORT: "", SECRET_KEY: " ", SETUP_TOKEN: "", DATABASE_URL: "" }),
    ).toMatchObject({
      port: 3000,
      secretKey: undefined,
      setupToken: undefined,
      databaseUrl: "sqlite://./data/mewte.db",
    });
  });

  it("reads overrides", () => {
    expect(
      loadConfig({
        PORT: "8080",
        TRUST_PROXY: "true",
        COOKIE_SECURE: "true",
        SECRET_KEY: SECRET,
        SETUP_TOKEN: "let-me-in",
        GITHUB_API_URL: "https://ghe.example.com/api/v3/",
      }),
    ).toMatchObject({
      port: 8080,
      trustProxy: true,
      cookieSecure: "true",
      secretKey: SECRET,
      setupToken: "let-me-in",
      githubApiUrl: "https://ghe.example.com/api/v3",
    });
  });

  it("explains what is wrong", () => {
    expect(() => loadConfig({ PORT: "abc" })).toThrow(/PORT/);
    expect(() => loadConfig({ SECRET_KEY: "too-short" })).toThrow(/SECRET_KEY/);
    expect(() => loadConfig({ COOKIE_SECURE: "maybe" })).toThrow(/COOKIE_SECURE/);
  });
});

describe("newId", () => {
  it("makes UUID v7 values that sort by creation order", () => {
    const ids = Array.from({ length: 50 }, () => newId());
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.toSorted()).toEqual(ids);
  });
});
