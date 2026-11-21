// Prisma Composer module for postiz-cheap.
//
// Deploy with (Prisma CLI 8 — the repo pins Prisma 7.8.0 for ORM commands,
// whose CLI has no `deploy` command):
//   npx prisma@latest deploy
// or enable deploy-on-push from the Prisma Console after linking the repo.
// The app name below becomes the Prisma project name on first deploy.
import { module } from "@prisma/composer";
import webService from "./service.ts";


export default module("postiz-cheap", ({ provision }) => {
  provision(webService);
});

