# Partner IP Allowlist Code Review Fixes

Completed on 2026-06-02.

## Landed FIX Groups

- FIX 1: `03e2fd11` — `fix(api): read IP allowlist under system context on login path + throw on missing partner row`
  - Missing partner rows now throw and are not cached.
  - Login-path allowlist reads run under system DB context when no request DB context exists.

- FIX 2: `4a8811c5` — `fix(api): rate-limit + structurally log inactive-allowlist warning`
  - The configured-but-inactive warning is rate-limited per partner for 60s and forwarded through `captureException`.

- FIX 3: `b30d8223` — `fix(api): fail closed + timing-floor on IP-check errors (guard 503, login denied)`
  - Guard failures return `503 ip_check_failed`.
  - Login IP-check failures await the timing floor and return the generic auth failure without minting tokens.

- FIX 5: `89efac88` — `refactor(api): no_partner reason + isBlocked helper + shared deny body`
  - Added `no_partner`, `isBlocked`, and `IP_NOT_ALLOWED_BODY`.
  - Updated guard and login call sites.

- FIX 4: `86eb1ed4` — `fix(api): enforce IP allowlist on partner-scoped API keys`
  - Partner-scoped MCP/OAuth API-key callers now run the same allowlist check before JSON-RPC dispatch.
  - Org-scoped and agent/system auth paths remain unaffected.

- FIX 6: `86e737f8` — `test(api): matcher edge cases, enforceIpAllowlist audit/branches, cache invalidation`
  - Added IPv4/IPv6 matcher edge cases, malformed CIDR regression coverage, enforcement branch/audit tests, and cache invalidation coverage.
  - Fixed empty CIDR prefix parsing so entries like `10.0.0.0/` do not match.

- FIX 7: `27001b0b` — `docs: correct IP allowlist comments + spec notes`
  - Corrected cache and enforcement comments.
  - Updated the design spec for system-context login reads, partner-scoped API-key enforcement, and shared `IpAllowlistStatus`.

## Deferred / Notes

- FIX 6(d): Did not add a focused `authMiddleware` integration test. The existing `auth.test.ts` has a broad auth/RLS/MFA mock graph, and adding this case would require globally mocking `ipAllowlistGuard` across that file. Added a short comment in `ipAllowlistGuard.ts` noting that agent routes are exempt because they never pass through `authMiddleware`, and partner-scoped API-key/MCP callers enforce separately.

## Verification

- `cd apps/api && PATH=$HOME/.nvm/versions/node/v22.20.0/bin:$PATH npx vitest run src/services/ipMatch.test.ts src/services/ipAllowlist.test.ts src/middleware/ipAllowlistGuard.test.ts src/routes/auth/login.test.ts src/routes/orgs.test.ts`
  - Passed: 5 files, 127 tests.

- `cd apps/api && PATH=$HOME/.nvm/versions/node/v22.20.0/bin:$PATH npx tsc --noEmit`
  - Passed with no errors.
