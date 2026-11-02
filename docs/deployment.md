# Deployment

Interim runs on one small server, with no Docker, next to whatever else that server runs. The kit is in [`deploy/`](../deploy). Production is replay only: it has no YouCam key, so it cannot spend units.

| What | Where |
| --- | --- |
| Web (port 3100), API (4100) and worker | PM2 processes `interim-web`, `interim-api`, `interim-worker` |
| Redis | PM2 process `interim-redis`, its own instance on 127.0.0.1:6380, capped at 64 MB |
| HTTPS | The server's Caddy, with one extra site block |
| Postgres | Neon (managed) |
| Photos and renders | Cloudflare R2, with `R2_KEY_PREFIX=prod/` when the bucket is shared |

Interim picks its own ports and Redis so that an app already on the machine (ports 3000 and 4000 are common) is never touched. Everything except the Caddy block runs as an ordinary user, with no sudo.

## Rules that are easy to get wrong

- **A shared R2 bucket needs the key prefix.** The cleanup job deletes every file in its bucket that its own database does not know. With `R2_KEY_PREFIX=prod/`, production only ever lists and deletes `prod/…` files and development never sees them. Two environments on one bucket without a prefix would delete each other's photos.
- **HTTPS is required.** The session cookie is secure only in production, and the camera needs a secure page. Point a hostname at the server (an A record for a subdomain of a domain you own is simplest) and Caddy gets the certificate. With no domain, a name such as `203-0-113-7.sslip.io` also resolves to the IP.
- **Google sign in needs the final address.** Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, register `https://HOST/api/auth/google/callback` as an authorized redirect URI, and move the consent screen out of "Testing", or only listed test users can sign in. Changing `WEB_ORIGIN` means updating the redirect URI, the R2 CORS origin and the Caddy block together.
- **Mail must go through Brevo in production.** The API refuses to start with `MAIL_MODE=log`. Give judges a ready account (below), so they never need an email.
- **`API_ORIGIN` is part of the web build.** The web server forwards `/api` to it, and the value is fixed when the web app is built, so `ship.sh` builds with `http://127.0.0.1:4100` (`turbo.json` declares it as a build input). A web build made for another API address must be rebuilt.
- **Use Neon's direct connection string** with `sslmode=require`, and drop `channel_binding=require` if it is there. Neon pauses an idle database, so the first request after a pause is slow. The connection pool tolerates the dropped connections.

## First deployment

1. **Server needs** Node 22, PM2 and `redis-server` installed (they are on most boxes that already run Node apps), and Caddy in front.
2. **Settings.** Copy [`deploy/env.production.example`](../deploy/env.production.example) to the server as `~/interim/.env.production`, fill it in (new `SESSION_SECRET` and `DATA_KEY`, each from `openssl rand -hex 32`), and run `chmod 600` on it. Back up `DATA_KEY`: without it saved reflections cannot be read.
3. **R2.** Add `https://HOST` to the bucket's CORS rule, allowing `PUT`, `GET` and `HEAD` with any header, or photo uploads fail.
4. **Database.** From your computer, with the Neon string: `DATABASE_URL='...' pnpm db:migrate`.
5. **Ship.** `SSH_PORT=22 deploy/ship.sh user@server` builds here, sends the build, installs production dependencies on the server and starts or reloads Interim's PM2 processes.
6. **HTTPS.** Add the block in [`deploy/caddy-site.example`](../deploy/caddy-site.example) (with `HOST` filled in) to `/etc/caddy/Caddyfile`, then `sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`. This is the only step that needs sudo.
7. **Demo and judge login.** Once the API has started (it adds the sample catalog), run `deploy/copy-demo.cjs` (its header lists the variables) to copy the demo people and pictures into production, and `DATABASE_URL='...' node deploy/make-account.cjs judge@example.test 'a long password'` to make a login that needs no email.
8. **Check.** Open `https://HOST`, sign in, choose a sample set on the style screen and look at `/demo`. Logs: `pm2 logs interim-api`.

## Updating

Merge to `master`, pull, run `deploy/ship.sh`, and run `pnpm db:migrate` first when the change adds a migration. `pm2 save` runs at the end, so the processes come back after a reboot where PM2 is set to resurrect them.
