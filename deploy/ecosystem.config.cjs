// PM2 processes for Interim on a server that already runs other apps. Interim has its own ports (web 3100,
// API 4100) and its own small Redis (6380), so nothing else on the machine is touched. Settings come from
// ~/interim/.env.production. Values set here win over anything PM2 inherited, so another app's settings
// cannot leak in.
const root = `${process.env.HOME}/interim`;
const envFile = `--env-file=${root}/.env.production`;

module.exports = {
  apps: [
    {
      name: 'interim-redis',
      script: 'redis-server',
      interpreter: 'none',
      args: ['--port', '6380', '--bind', '127.0.0.1', '--maxmemory', '64mb', '--maxmemory-policy', 'noeviction', '--save', '', '--appendonly', 'no'],
    },
    {
      name: 'interim-api',
      cwd: `${root}/apps/api`,
      script: 'dist/main.js',
      node_args: `${envFile} --enable-source-maps`,
      max_memory_restart: '450M',
      env: { NODE_ENV: 'production', PORT: '4100' },
    },
    {
      name: 'interim-worker',
      cwd: `${root}/apps/api`,
      script: 'dist/worker.js',
      node_args: `${envFile} --enable-source-maps`,
      max_memory_restart: '450M',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'interim-web',
      cwd: `${root}/apps/web`,
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3100 -H 127.0.0.1',
      node_args: envFile,
      max_memory_restart: '600M',
      env: { NODE_ENV: 'production', API_ORIGIN: 'http://127.0.0.1:4100' },
    },
  ],
};
