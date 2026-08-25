import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.service';

describe('password hashing', () => {
  it('produces an argon2id hash, never the password itself', async () => {
    const hash = await hashPassword('Correct-Horse-42');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('Correct-Horse-42');
  });

  it('salts, so the same password hashes differently every time', async () => {
    const [first, second] = await Promise.all([
      hashPassword('Correct-Horse-42'),
      hashPassword('Correct-Horse-42'),
    ]);
    expect(first).not.toBe(second);
  });

  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('Correct-Horse-42');
    await expect(verifyPassword(hash, 'Correct-Horse-42')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'correct-horse-42')).resolves.toBe(false);
    await expect(verifyPassword(hash, '')).resolves.toBe(false);
  });

  it('treats a corrupted stored hash as a failed login, not a crash', async () => {
    await expect(verifyPassword('not-a-hash', 'anything')).resolves.toBe(false);
    await expect(verifyPassword('', 'anything')).resolves.toBe(false);
  });
});
