export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}

/**
 * Argon2id through Bun's built-in implementation. The PHC string it produces records the
 * algorithm and its parameters, so they can be raised later without a migration.
 */
export const argon2Hasher: PasswordHasher = {
  hash: (password) => Bun.password.hash(password, { algorithm: "argon2id" }),
  async verify(password, hash) {
    try {
      return await Bun.password.verify(password, hash);
    } catch {
      return false;
    }
  },
};
