import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// 외부 서비스 토큰을 DB에 저장하기 전 암호화한다(AES-256-GCM).
// 저장 형식: [키 버전 1바이트][IV 12바이트][인증 태그 16바이트][암호문]
// AAD에는 connection_id를 넣어 다른 행으로 옮긴 암호문이 복호화되지 않게 한다.

const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = 1 + IV_LENGTH + TAG_LENGTH;

export type Keyring = {
  currentVersion: number;
  keys: Map<number, Buffer>;
};

export function decodeKey(base64: string): Buffer {
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY는 base64로 인코딩한 32바이트여야 합니다.");
  }
  return key;
}

export function encryptToken(plaintext: string, aad: string, keyring: Keyring): Buffer {
  const version = keyring.currentVersion;
  const key = keyring.keys.get(version);
  if (!key) throw new Error(`암호화 키 버전 ${version}이 없습니다.`);
  if (version < 0 || version > 255) throw new Error("키 버전은 0~255여야 합니다.");

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.from([version]), iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptToken(payload: Buffer, aad: string, keyring: Keyring): string {
  if (payload.length < HEADER_LENGTH) throw new Error("암호문 길이가 올바르지 않습니다.");
  const version = payload[0];
  const key = keyring.keys.get(version);
  if (!key) throw new Error(`암호화 키 버전 ${version}이 없습니다.`);

  const iv = payload.subarray(1, 1 + IV_LENGTH);
  const tag = payload.subarray(1 + IV_LENGTH, HEADER_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(payload.subarray(HEADER_LENGTH)), decipher.final()]).toString(
    "utf8",
  );
}

/** 키 교체 대상인지(현재 버전이 아닌 키로 암호화됐는지) */
export function needsReencryption(payload: Buffer, keyring: Keyring): boolean {
  return payload[0] !== keyring.currentVersion;
}

/**
 * 환경 변수에서 키링을 만든다.
 * TOKEN_ENCRYPTION_KEY / TOKEN_ENCRYPTION_KEY_VERSION: 현재 키
 * TOKEN_ENCRYPTION_KEY_PREVIOUS / TOKEN_ENCRYPTION_KEY_PREVIOUS_VERSION: 교체 중일 때만 이전 키
 */
export function keyringFromEnv(env: NodeJS.ProcessEnv = process.env): Keyring {
  const current = env.TOKEN_ENCRYPTION_KEY;
  if (!current) throw new Error("TOKEN_ENCRYPTION_KEY가 설정되지 않았습니다.");
  const currentVersion = Number(env.TOKEN_ENCRYPTION_KEY_VERSION ?? "1");
  const keys = new Map<number, Buffer>([[currentVersion, decodeKey(current)]]);

  if (env.TOKEN_ENCRYPTION_KEY_PREVIOUS) {
    const previousVersion = Number(env.TOKEN_ENCRYPTION_KEY_PREVIOUS_VERSION);
    if (!Number.isInteger(previousVersion) || previousVersion === currentVersion) {
      throw new Error("TOKEN_ENCRYPTION_KEY_PREVIOUS_VERSION이 올바르지 않습니다.");
    }
    keys.set(previousVersion, decodeKey(env.TOKEN_ENCRYPTION_KEY_PREVIOUS));
  }
  return { currentVersion, keys };
}
