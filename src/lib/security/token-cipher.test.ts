import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptToken,
  encryptToken,
  keyringFromEnv,
  needsReencryption,
  type Keyring,
} from "./token-cipher";

function keyring(version: number, ...extra: [number, Buffer][]): Keyring {
  return { currentVersion: version, keys: new Map([[version, randomBytes(32)], ...extra]) };
}

describe("token-cipher", () => {
  it("암호화한 값을 같은 AAD로 복호화한다", () => {
    const ring = keyring(1);
    const payload = encryptToken("refresh-token-값", "conn-1", ring);
    expect(payload.toString("utf8")).not.toContain("refresh-token");
    expect(decryptToken(payload, "conn-1", ring)).toBe("refresh-token-값");
  });

  it("같은 평문도 매번 다른 암호문이 된다", () => {
    const ring = keyring(1);
    expect(encryptToken("a", "c", ring).equals(encryptToken("a", "c", ring))).toBe(false);
  });

  it("AAD가 다르면 복호화에 실패한다", () => {
    const ring = keyring(1);
    const payload = encryptToken("secret", "conn-1", ring);
    expect(() => decryptToken(payload, "conn-2", ring)).toThrow();
  });

  it("암호문이 변조되면 복호화에 실패한다", () => {
    const ring = keyring(1);
    const payload = encryptToken("secret", "conn-1", ring);
    payload[payload.length - 1] ^= 0xff;
    expect(() => decryptToken(payload, "conn-1", ring)).toThrow();
  });

  it("이전 키 버전으로 만든 암호문을 읽고 재암호화 대상으로 판단한다", () => {
    const oldRing = keyring(1);
    const payload = encryptToken("secret", "c", oldRing);
    const newRing: Keyring = {
      currentVersion: 2,
      keys: new Map([
        [2, randomBytes(32)],
        [1, oldRing.keys.get(1)!],
      ]),
    };
    expect(decryptToken(payload, "c", newRing)).toBe("secret");
    expect(needsReencryption(payload, newRing)).toBe(true);
  });

  it("환경 변수 키 길이를 검사한다", () => {
    expect(() =>
      keyringFromEnv({ TOKEN_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/32바이트/);
    const ring = keyringFromEnv({
      TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
      TOKEN_ENCRYPTION_KEY_VERSION: "3",
    } as unknown as NodeJS.ProcessEnv);
    expect(ring.currentVersion).toBe(3);
  });
});
