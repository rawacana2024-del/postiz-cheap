// Prisma Composer service declaration for the postiz-cheap Next.js app.
//
// The service is the repo's Next.js app, built with `next build`
// (`output: "standalone"` in next.config.mjs — Compute runs the standalone
// server that build emits).
//
// Configuration (DATABASE_URL, GOOGLE_CLIENT_ID/SECRET, NEXTAUTH_SECRET,
// NEXTAUTH_URL, MUAPIAPP_API_KEY, Stripe keys) is NOT declared here: the app
// reads it from process.env, exactly as it does locally, and Compute injects
// the project's environment variables into the deployment (see
// prisma.io/docs/compute/environment-variables). Set them with
// `npx prisma project env add` or in the Prisma Console before deploying.
// The full Composer-typed alternative — declaring every value as a service
// input and reading it via service.input(), plus a rawPostgres() database
// dependency read via service.load() — is documented in DEPLOYMENT.md as a
// follow-up; it requires touching ~18 files that currently import
// src/lib/config, src/lib/prisma and src/lib/auth, so it is deliberately
// NOT part of this minimal deploy prep.
import nextjs from "@prisma/composer/nextjs";
import { compute } from "@prisma/composer-prisma-cloud";

export default compute({
  name: "web",
  deps: {},
  build: nextjs({ module: import.meta.url, appDir: ".." }),
});
