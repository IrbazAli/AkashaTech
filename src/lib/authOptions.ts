import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "./prisma";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  providers: [
    // Dummy credential provider for MVP
    CredentialsProvider({
      name: "Guest or Premium Account",
      credentials: {
        username: { label: "Username (Type 'guest', 'user', or 'premium')", type: "text", placeholder: "guest" },
      },
      async authorize(credentials) {
        if (!credentials?.username) return null;
        
        let role = "GUEST";
        let email = "guest@example.com";
        if (credentials.username.toLowerCase() === "premium") {
          role = "PREMIUM";
          email = "premium@example.com";
        } else if (credentials.username.toLowerCase() === "user") {
          role = "USER";
          email = "user@example.com";
        }

        // Upsert user for MVP test purposes
        const user = await prisma.user.upsert({
          where: { email },
          update: { role },
          create: {
            email,
            name: credentials.username,
            role,
          },
        });

        return { id: user.id, name: user.name, email: user.email, role: user.role };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
        (session.user as any).id = token.id;
      }
      return session;
    }
  }
};
