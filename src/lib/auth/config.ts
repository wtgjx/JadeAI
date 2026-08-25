import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { config } from '@/lib/config';
import { userRepository } from '@/lib/db/repositories/user.repository';
import { isRateLimited } from '@/lib/rate-limit';

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: config.auth.enabled
    ? [
        // Web mode: email + password
        Credentials({
          name: 'Credentials',
          credentials: {
            email: { label: 'Email', type: 'text' },
            password: { label: 'Password', type: 'password' },
          },
          async authorize(credentials, request) {
            const email = credentials?.email as string | undefined;
            const password = credentials?.password as string | undefined;
            if (!email || !password) return null;

            const ip = (request?.headers as any)?.get?.('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
            if (isRateLimited(`login:${ip}`, 30, 60_000)) return null;

            const dbUser = await userRepository.findByEmail(email.trim().toLowerCase());
            if (!dbUser) return null;

            const valid = await bcrypt.compare(password, dbUser.passwordHash || '');
            if (!valid) return null;

            return {
              id: dbUser.id,
              email: dbUser.email,
              name: dbUser.name,
            };
          },
        }),
      ]
    : [
        Credentials({
          name: 'Fingerprint',
          credentials: {
            fingerprint: { label: 'Fingerprint', type: 'text' },
          },
          async authorize(credentials) {
            const fingerprint = credentials?.fingerprint as string;
            if (!fingerprint) return null;
            return {
              id: `fp_${fingerprint}`,
              name: 'Anonymous User',
            };
          },
        }),
      ],
  callbacks: {
    async jwt({ token, user, account }) {
      // Credentials (email+password / fingerprint) mode
      if (user && !account?.provider) {
        token.userId = user.id;
        token.email = user.email;
        token.name = user.name;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.userId || token.sub) as string;
        if (token.name) session.user.name = token.name as string;
        if (token.email) session.user.email = token.email as string;
        if (token.picture) session.user.image = token.picture as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.AUTH_SECRET,
});
