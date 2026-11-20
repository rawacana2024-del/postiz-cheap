import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "./prisma";

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
    // NOTE (2026-11-21, Prisma deploy prep): the "Demo / Admin Account"
    // CredentialsProvider was removed. It accepted ANY email with NO password
    // check and auto-created a user with 50 credits — anyone could sign in
    // as any account on a public deployment. Google sign-in is now the only
    // provider. Do not re-add a credentials provider without a real
    // password check.
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.credits = user.credits ?? 50;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id || token.sub;
        session.user.credits = token.credits ?? 50;
      }
      return session;
    },
  },
  // No fallback secret: a real NEXTAUTH_SECRET must be set in the deployment
  // environment. The old hardcoded fallback meant every install shared one
  // public session-signing secret.
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
  },
};

