import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { compare, hash } from "bcryptjs";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import type { AccountStatus, Role } from "@/lib/types";

declare module "next-auth" {
  interface User {
    role: Role;
    status: AccountStatus;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
      status: AccountStatus;
      image?: string | null;
    };
  }
}

type SessionToken = {
  id?: string;
  role?: Role;
  status?: AccountStatus;
};

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user) return null;

        if (!user.hashedPassword) return null;

        const isValid = await compare(
          credentials.password as string,
          user.hashedPassword
        );

        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") {
        return true;
      }

      const email = user.email ?? profile?.email;
      if (!email) {
        return false;
      }

      const existing = await prisma.user.findUnique({
        where: { email },
      });

      if (!existing) {
        const newUserId = `u_${randomUUID().replace(/-/g, "")}`;
        const oauthOnlyPassword = await hash(randomUUID(), 12);

        const createdRows = await prisma.$queryRaw<
          Array<{ id: string; role: Role; status: AccountStatus }>
        >`
          INSERT INTO users (id, email, name, "hashedPassword", role, status, "createdAt", "updatedAt")
          VALUES (
            ${newUserId},
            ${email},
            ${user.name || "Student"},
            ${oauthOnlyPassword},
            'STUDENT'::"Role",
            'APPROVED'::"AccountStatus",
            NOW(),
            NOW()
          )
          RETURNING id, role::text AS role, status::text AS status
        `;

        const created = createdRows[0];

        if (!created) {
          return false;
        }

        user.id = created.id;
        user.role = created.role;
        user.status = created.status;
        return true;
      }

      const nextRole =
        existing.role === "ADMIN" || existing.role === "SUPER_ADMIN"
          ? existing.role
          : "STUDENT";

      const updatedRows =
        nextRole === existing.role
          ? []
          : await prisma.$queryRaw<Array<{ id: string; role: Role; status: AccountStatus }>>`
              UPDATE users
              SET role = ${nextRole}::"Role", "updatedAt" = NOW()
              WHERE id = ${existing.id}
              RETURNING id, role::text AS role, status::text AS status
            `;

      const updated =
        updatedRows[0] ?? {
          id: existing.id,
          role: existing.role,
          status: existing.status,
        };

      user.id = updated.id;
      user.role = updated.role;
      user.status = updated.status;
      return true;
    },
    async jwt({ token, user }) {
      const sessionToken = token as SessionToken;
      if (user) {
        sessionToken.id = user.id as string;
        sessionToken.role = (user as { role: Role }).role;
        sessionToken.status = (user as { status: AccountStatus }).status;
      }
      return token;
    },
    async session({ session, token }) {
      const sessionToken = token as SessionToken;
      if (sessionToken) {
        session.user.id = sessionToken.id as string;
        session.user.role = sessionToken.role as Role;
        session.user.status = sessionToken.status as AccountStatus;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
});
