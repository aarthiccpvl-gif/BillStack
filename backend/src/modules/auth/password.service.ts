import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing.
 *
 * argon2id via @node-rs/argon2 — it ships prebuilt binaries, so no C++ toolchain is
 * needed on a Windows developer machine, and it is the current OWASP recommendation.
 * Parameters follow the OWASP minimum for argon2id (19 MiB, 2 iterations, 1 lane).
 */
const OPTIONS = {
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export const hashPassword = (plain: string): Promise<string> => hash(plain, OPTIONS);

/**
 * Verifies a password. Returns false rather than throwing on a malformed stored
 * hash, so a corrupted row is a failed login and not a 500.
 */
export const verifyPassword = async (storedHash: string, plain: string): Promise<boolean> => {
  try {
    return await verify(storedHash, plain, OPTIONS);
  } catch {
    return false;
  }
};
