// Copies the public demo (the simulated people, their check ins and the pictures) from one environment to
// another: rows between two Postgres databases and images between two R2 buckets. Safe to run again.
// The target database must be migrated and the API started once, because the sample catalog is added at start.
// Usage (all variables required):
//   SRC_DATABASE_URL SRC_R2_ENDPOINT SRC_R2_BUCKET SRC_R2_ACCESS_KEY_ID SRC_R2_SECRET_ACCESS_KEY
//   DST_DATABASE_URL DST_R2_ENDPOINT DST_R2_BUCKET DST_R2_ACCESS_KEY_ID DST_R2_SECRET_ACCESS_KEY
// Optional: SRC_R2_KEY_PREFIX and DST_R2_KEY_PREFIX (for example prod/), which let both sides share one bucket.
//   node deploy/copy-demo.cjs
const path = require('node:path');
const api = (name) => require(require.resolve(name, { paths: [path.resolve(__dirname, '../apps/api')] }));
const { Client } = api('pg');
const { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } = api('@aws-sdk/client-s3');

const need = ['DATABASE_URL', 'R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];
for (const side of ['SRC', 'DST']) for (const n of need) if (!process.env[`${side}_${n}`]) { console.error(`Missing ${side}_${n}`); process.exit(1); }
const prefix = { SRC: process.env.SRC_R2_KEY_PREFIX ?? '', DST: process.env.DST_R2_KEY_PREFIX ?? '' };
if (process.env.SRC_R2_BUCKET === process.env.DST_R2_BUCKET && process.env.SRC_R2_ENDPOINT === process.env.DST_R2_ENDPOINT && prefix.SRC === prefix.DST) {
  console.error('The source and target share a bucket and a prefix, so they would overwrite each other. Give the target a prefix such as prod/.');
  process.exit(1);
}
const s3 = (side) => new S3Client({ region: 'auto', endpoint: process.env[`${side}_R2_ENDPOINT`], credentials: { accessKeyId: process.env[`${side}_R2_ACCESS_KEY_ID`], secretAccessKey: process.env[`${side}_R2_SECRET_ACCESS_KEY`] } });

// What the demo needs, in an order that satisfies the foreign keys.
const steps = [
  ['profile', 'id = any($1)', 'profiles'],
  ['snapshot', 'profile_id = any($1)', 'profiles'],
  ['self_report', 'snapshot_id = any($1)', 'snapshots'],
  ['photo', 'snapshot_id = any($1)', 'snapshots'],
  ['measurement', 'snapshot_id = any($1)', 'snapshots'],
  ['render', 'snapshot_id = any($1)', 'snapshots'],
  ['run', 'snapshot_id = any($1)', 'snapshots'],
  ['trace_entry', 'run_id = any($1)', 'runs'],
  ['stage_card', 'run_id = any($1)', 'runs'],
  ['garment', 'profile_id = any($1)', 'profiles'],
];

(async () => {
  const src = new Client({ connectionString: process.env.SRC_DATABASE_URL });
  const dst = new Client({ connectionString: process.env.DST_DATABASE_URL });
  await src.connect();
  await dst.connect();
  const ids = { profiles: [], snapshots: [], runs: [] };
  ids.profiles = (await src.query(`select id from profile where owner_ref = 'sample' and judge_sample`)).rows.map((r) => r.id);
  if (ids.profiles.length === 0) throw new Error('No demo profiles in the source database.');
  ids.snapshots = (await src.query('select id from snapshot where profile_id = any($1)', [ids.profiles])).rows.map((r) => r.id);
  ids.runs = (await src.query('select id from run where snapshot_id = any($1)', [ids.snapshots])).rows.map((r) => r.id);

  const keys = new Set();
  for (const [table, where, scope] of steps) {
    // the database builds the JSON itself, so timestamps arrive exactly as stored
    const { rows } = await src.query(`select coalesce(json_agg(t), '[]'::json) as rows from (select * from "${table}" where ${where}) t`, [ids[scope]]);
    const list = rows[0].rows;
    if (list.length > 0) {
      await dst.query(`insert into "${table}" select * from json_populate_recordset(null::"${table}", $1::json) on conflict do nothing`, [JSON.stringify(list)]);
    }
    if (table === 'photo' || table === 'render') for (const r of list) if (r.object_key) keys.add(r.object_key);
    console.log(`${table.padEnd(12)} ${list.length} rows`);
  }

  const from = s3('SRC');
  const to = s3('DST');
  let copied = 0, present = 0;
  for (const Key of keys) {
    try { await to.send(new HeadObjectCommand({ Bucket: process.env.DST_R2_BUCKET, Key: prefix.DST + Key })); present++; continue; } catch { /* not there yet */ }
    const object = await from.send(new GetObjectCommand({ Bucket: process.env.SRC_R2_BUCKET, Key: prefix.SRC + Key }));
    await to.send(new PutObjectCommand({ Bucket: process.env.DST_R2_BUCKET, Key: prefix.DST + Key, Body: Buffer.from(await object.Body.transformToByteArray()), ContentType: 'image/jpeg' }));
    copied++;
  }
  console.log(`images: ${copied} copied, ${present} already there, ${keys.size} in all`);
  await src.end();
  await dst.end();
})().catch((error) => { console.error(error.message); process.exit(1); });
