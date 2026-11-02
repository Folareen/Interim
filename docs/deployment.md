# Deployment

One small VPS runs everything except Postgres, with no Docker. The kit is in [`deploy/`](../deploy). Production is replay only: it has no YouCam key, so it cannot spend units.

| What | Where |
| --- | --- |
| Web, API and worker | The VPS, three systemd services (`interim-web`, `interim-api`, `interim-worker`) |
| HTTPS | Caddy on the VPS, with a certificate it gets and renews itself |
| Redis | The VPS, listening on localhost only, capped at 64 MB |
| Postgres | Neon (managed) |
| Photos and renders | Cloudflare R2, **its own bucket** |

## Rules that are easy to get wrong

- **Production gets its own R2 bucket.** The cleanup job deletes every file in its bucket that its own database does not know. Two environments on one bucket would delete each other's photos.
- **HTTPS is required.** The session cookie is secure only in production, and the camera needs a secure page. With no domain, use a name that points at the server's IP, such as `203-0-113-7.sslip.io`, which Caddy can get a certificate for.
- **Mail must go through Brevo in production.** The API refuses to start with `MAIL_MODE=log`. Give judges a ready account (below), so they never need an email.
- **`API_ORIGIN` is part of the web build.** The web server forwards `/api` to it, and the value is fixed when the web app is built, so `ship.sh` builds with `http://127.0.0.1:4000` (`turbo.json` declares it as a build input). A web build made for another API address must be rebuilt.
- **Use Neon's direct connection string** with `sslmode=require`, and drop `channel_binding=require` if it is there. Neon pauses an idle database, so the first request after a pause is slow. The connection pool tolerates the dropped connections.

## First deployment

1. **Neon.** Create a project near the server and copy the direct connection string.
2. **R2.** Create a private bucket (for example `interim-prod`), an Object Read and Write token limited to it, and a CORS rule that allows `PUT` from `https://HOST` with the `Content-Type` header.
3. **Server.** Open ports 80 and 443, then from this repo:
   ```bash
   scp -r deploy root@SERVER:/root/interim-deploy
   ssh root@SERVER 'bash /root/interim-deploy/setup-server.sh HOST'
   ```
4. **Settings.** Copy [`deploy/env.production.example`](../deploy/env.production.example) to the server as `/etc/interim/env`, fill it in (new `SESSION_SECRET` and `DATA_KEY`, each from `openssl rand -hex 32`), and run `chmod 600 /etc/interim/env`. Back up `DATA_KEY`: without it saved reflections cannot be read.
5. **Database.** From your computer, with the Neon string: `DATABASE_URL='...' pnpm db:migrate`.
6. **Ship.** `deploy/ship.sh root@SERVER` builds here, sends the build, installs production dependencies on the server and restarts the services.
7. **Demo and judge login.** Once the API has started (it adds the sample catalog), run `deploy/copy-demo.cjs` (its header lists the variables) to copy the demo people and pictures into production, and `DATABASE_URL='...' node deploy/make-account.cjs judge@example.test 'a long password'` to make a login that needs no email.
8. **Check.** Open `https://HOST`, sign in, choose a sample set on the style screen and look at `/demo`. Logs: `journalctl -u interim-api -f`.

## Updating

Merge to `master`, pull, run `deploy/ship.sh root@SERVER`, and run `pnpm db:migrate` first when the change adds a migration.
