# Security

## Secrets

Never commit `.env` files or real credentials. Keep `.env.example` as the only committed environment file, and use empty placeholders there.

Use read-only Azure Cosmos DB credentials only. The dashboard must not be given credentials that can create, update, delete, upsert, patch, replace, alter, migrate, or manage schema.

## Exposure

Do not expose this app directly to the public internet. Deploy it behind Cloudflare Access or an equivalent authentication layer.

If using Cloudflare Tunnel, keep tunnel credentials and tokens outside the repository. Never commit tunnel tokens, connector credentials, or generated Cloudflare credential JSON.

## Portainer

Portainer must not be exposed publicly without strong access controls. Use private networking, strong authentication, least-privilege access, and an authenticated access layer such as Cloudflare Access or a VPN.

## Data Access

Keep all database access isolated in `src/lib/reports/appointmentReadOnlyRepository.js`. Only read-only `SELECT` queries are allowed there.

Keep `USE_REAL_REPORT_DATA=false` by default. Enable real data only in a trusted server-side runtime with read-only credentials.
