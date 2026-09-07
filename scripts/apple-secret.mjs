#!/usr/bin/env node
// Builds the client secret Apple wants for Sign in with Apple: a JWT signed
// with the .p8 key from the developer account. Apple caps its life at six
// months, so this has to be rerun (and the Worker secret updated) twice a
// year.
//
//   node scripts/apple-secret.mjs --team TEAMID --key KEYID \
//     --client com.example.gnaw.web --p8 ./AuthKey_KEYID.p8 [--days 180]
import { readFileSync } from "node:fs";
import { createPrivateKey, sign } from "node:crypto";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1]] : null))
    .filter(Boolean),
);
for (const k of ["team", "key", "client", "p8"])
  if (!args[k]) {
    console.error(`Missing --${k}. See the comment at the top of this file.`);
    process.exit(1);
  }
const days = Math.min(Number(args.days ?? 180), 182);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const header = b64({ alg: "ES256", kid: args.key, typ: "JWT" });
const payload = b64({
  iss: args.team,
  iat: now,
  exp: now + days * 86400,
  aud: "https://appleid.apple.com",
  sub: args.client,
});
const key = createPrivateKey(readFileSync(args.p8, "utf8"));
const signature = sign("sha256", Buffer.from(`${header}.${payload}`), {
  key,
  dsaEncoding: "ieee-p1363",
}).toString("base64url");
process.stdout.write(`${header}.${payload}.${signature}\n`);
