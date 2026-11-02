// Creates (or resets) a signed-in-ready account, so a judge can sign in with a password without email.
// Usage: DATABASE_URL=... node deploy/make-account.cjs email password
const { randomBytes, scrypt } = require('node:crypto');
const { Client } = require(require.resolve('pg', { paths: [require('node:path').resolve(__dirname, '../apps/api')] }));

const [email, password] = process.argv.slice(2);
if (!process.env.DATABASE_URL || !email || !password) {
  console.error('Usage: DATABASE_URL=... node deploy/make-account.cjs email password');
  process.exit(1);
}
if (password.length < 10) {
  console.error('Use a password of at least 10 characters.');
  process.exit(1);
}

// The same scrypt settings the API uses, so the stored hash checks out at sign in.
const hash = (pw) =>
  new Promise((resolve, reject) => {
    const salt = randomBytes(16);
    scrypt(pw, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(`scrypt$32768$8$1$${salt.toString('base64url')}$${key.toString('base64url')}`),
    );
  });

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const passwordHash = await hash(password);
  const { rows } = await client.query(
    `insert into account (email, email_verified_at, password_hash) values (lower($1), now(), $2)
     on conflict (email) do update set password_hash = excluded.password_hash, email_verified_at = now()
     returning id, email`,
    [email, passwordHash],
  );
  console.log(`Account ready: ${rows[0].email}`);
  await client.end();
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
