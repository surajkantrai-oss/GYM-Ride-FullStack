import { PasswordHasher } from './password-hasher';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();
  it('uses a salted Argon2id hash and verifies it', async () => {
    const first = await hasher.hash('a-long-development-passphrase');
    const second = await hasher.hash('a-long-development-passphrase');
    expect(first).toContain('$argon2id$');
    expect(first).not.toEqual(second);
    await expect(hasher.verify(first, 'a-long-development-passphrase')).resolves.toBe(true);
    await expect(hasher.verify(first, 'wrong')).resolves.toBe(false);
  });
});
