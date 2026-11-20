import "dotenv/config";
import { defineConfig } from "prisma/config";
// Composer deploy config (Prisma Compute). The `composer()` helper and the
// extensions come from @prisma/composer 0.39.0; the `deploy` command itself
// ships in the Prisma CLI 8 (`npx prisma@latest deploy`) — the repo pins
// Prisma 7.8.0 for ORM commands, whose CLI has no `deploy` command.
// NOTE: Prisma 7.8.0's defineConfig type does not declare a `composer` key
// (it arrived with Prisma 8's definePrismaConfig), so the section below is
// validated by the Prisma 8 CLI at deploy time, not by the local 7.8.0 CLI.
// `npx prisma validate` must still pass: the 7.8.0 CLI ignores the key.
import { defineConfig as composer } from "@prisma/composer/config";
import { nodeBuild } from "@prisma/composer/node/control";
import { nextjsBuild } from "@prisma/composer/nextjs/control";
import { prismaCloud, prismaState } from "@prisma/composer-prisma-cloud/control";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"] || process.env["DATABASE_URL"],
  },
  // @ts-expect-error: `composer` is a Prisma 8 / Composer key; Prisma 7.8.0's
  // defineConfig type does not declare it yet. It is read by `prisma deploy`
  // (Prisma CLI 8), not by Prisma 7 ORM commands.
  composer: composer({
    entry: "./composer/module.ts",
    extensions: [prismaCloud(), nodeBuild(), nextjsBuild()],
    state: prismaState(),
  }),
});
