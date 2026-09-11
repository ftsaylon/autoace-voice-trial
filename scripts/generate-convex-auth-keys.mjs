#!/usr/bin/env node
/**
 * Non-interactive Convex Auth RS256 keypair.
 * Do not run `npx @convex-dev/auth` — that wizard needs a TTY and hangs headless.
 *
 * Default: JSON on stdout ({ JWT_PRIVATE_KEY, JWKS }).
 * --export: shell assignments for `eval "$(node scripts/generate-convex-auth-keys.mjs --export)"`.
 */
import { generateKeyPair, exportPKCS8, exportJWK } from "jose";

const { privateKey, publicKey } = await generateKeyPair("RS256", {
  extractable: true,
});
const JWT_PRIVATE_KEY = (await exportPKCS8(privateKey))
  .trimEnd()
  .replace(/\n/g, " ");
const jwk = await exportJWK(publicKey);
const JWKS = JSON.stringify({ keys: [{ use: "sig", ...jwk }] });

if (process.argv.includes("--export")) {
  process.stdout.write(`export JWT_PRIVATE_KEY=${JSON.stringify(JWT_PRIVATE_KEY)}\n`);
  process.stdout.write(`export JWKS=${JSON.stringify(JWKS)}\n`);
  process.exit(0);
}

process.stdout.write(JSON.stringify({ JWT_PRIVATE_KEY, JWKS }, null, 2) + "\n");
process.stderr.write(`
Set these on the Convex deployment with the NAME=VALUE form so the PEM is not parsed as a flag:

  eval "$(node scripts/generate-convex-auth-keys.mjs --export)"
  npx convex env set "JWT_PRIVATE_KEY=$JWT_PRIVATE_KEY"
  npx convex env set "JWKS=$JWKS"

Do not use: npx convex env set JWT_PRIVATE_KEY "$JWT_PRIVATE_KEY"
(the value starts with -----BEGIN and the CLI treats the leading dash as a flag).
`);
