import { randomBytes } from 'crypto';

import { AuthOptions } from 'next-auth';
import GitHubProvider from 'next-auth/providers/github';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';

import { prisma } from '@/prisma/prisma-client';
import { compare, hashSync } from 'bcrypt';
import { UserRole } from '@prisma/client';
import { findOrCreateUserByPhone, verifyOtpCore } from '@/lib/otp';
import { logger } from '@/lib/logger';

async function isGithubEmailVerified(
  email: string | null | undefined,
  accessToken: string | undefined,
): Promise<boolean> {
  if (!email || !accessToken) {
    return false;
  }
  try {
    const res = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'pizza-app',
      },
    });
    if (!res.ok) {
      logger.warn('oauth_github_emails_fetch_failed', { status: res.status });
      return false;
    }
    const emails = (await res.json()) as Array<{
      email: string;
      primary: boolean;
      verified: boolean;
    }>;
    const normalized = email.toLowerCase();
    const match = emails.find(e => e.email.toLowerCase() === normalized);
    return !!match?.verified;
  } catch (err) {
    logger.error('oauth_github_emails_fetch_error', err);
    return false;
  }
}

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
    GitHubProvider({
      clientId: process.env.GITHUB_ID || '',
      clientSecret: process.env.GITHUB_SECRET || '',
      profile(profile) {
        return {
          id: profile.id,
          name: profile.name || profile.login,
          email: profile.email,
          image: profile.avatar_url,
          role: 'USER' as UserRole,
        };
      },
    }),
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const findUser = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!findUser) {
          return null;
        }

        // OAuth-only users have a random opaque password hash and must sign
        // in through their OAuth provider — never let Credentials authorize
        // them even if an attacker somehow guessed the random password.
        if (findUser.provider && findUser.provider !== 'credentials') {
          return null;
        }

        const isPasswordValid = await compare(
          credentials.password,
          findUser.password
        );

        if (!isPasswordValid) {
          return null;
        }

        if (!findUser.verified) {
          return null;
        }

        return {
          id: findUser.id,
          email: findUser.email,
          name: findUser.fullName,
          role: findUser.role,
        };
      },
    }),
    CredentialsProvider({
      id: 'phone-otp',
      name: 'Phone OTP',
      credentials: {
        phone: { label: 'Phone', type: 'text' },
        code: { label: 'Code', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.phone || !credentials?.code) {
          return null;
        }

        const result = await verifyOtpCore(credentials.phone, credentials.code);
        if (!result.ok) {
          return null;
        }

        const user = await findOrCreateUserByPhone(result.phone);

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          role: user.role,
        };
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      try {
        if (
          account?.provider === 'credentials' ||
          account?.provider === 'phone-otp'
        ) {
          return true;
        }

        if (!user.email) {
          return false;
        }

        // OAuth email_verified guard — without it, an attacker who controls
        // an OAuth provider that doesn't verify emails could claim any
        // arbitrary email and hijack an existing pizza-app account that
        // happens to use the same address.
        if (account?.provider === 'google') {
          const googleProfile = profile as { email_verified?: boolean } | undefined;
          if (googleProfile?.email_verified !== true) {
            logger.warn('oauth_email_not_verified', {
              provider: 'google',
              email: user.email,
            });
            return false;
          }
        } else if (account?.provider === 'github') {
          const verified = await isGithubEmailVerified(
            user.email,
            account.access_token,
          );
          if (!verified) {
            logger.warn('oauth_email_not_verified', {
              provider: 'github',
              email: user.email,
            });
            return false;
          }
        }

        const byProvider = account?.provider && account?.providerAccountId
          ? await prisma.user.findFirst({
              where: {
                provider: account.provider,
                providerId: account.providerAccountId,
              },
            })
          : null;
        const byEmail = byProvider
          ? null
          : await prisma.user.findUnique({
              where: { email: user.email },
            });
        const findUser = byProvider ?? byEmail;

        if (findUser) {
          await prisma.user.update({
            where: {
              id: findUser.id,
            },
            data: {
              provider: account?.provider,
              providerId: account?.providerAccountId,
            },
          });

          return true;
        }

        await prisma.user.create({
          data: {
            email: user.email,
            fullName: user.name || 'User #' + user.id,
            // Opaque, unguessable password hash — OAuth users never sign in
            // via Credentials (the Credentials authorize() also rejects
            // OAuth users explicitly), so this value is only ever compared
            // against attacker-supplied input and must not be derivable.
            password: hashSync(randomBytes(32).toString('hex'), 10),
            verified: new Date(),
            provider: account?.provider,
            providerId: account?.providerAccountId,
          },
        });

        return true;
      } catch (error) {
        logger.error('signin_callback_failed', error, {
          provider: account?.provider,
        });
        return false;
      }
    },
    async jwt({ token }) {
      if (!token.email) {
        return token;
      }

      const findUser = await prisma.user.findUnique({
        where: {
          email: token.email,
        },
      });

      if (findUser) {
        token.id = String(findUser.id);
        token.email = findUser.email;
        token.fullName = findUser.fullName;
        token.role = findUser.role;
        token.phoneVerified = !!findUser.phoneVerified;
      }

      return token;
    },
    session({ session, token }) {
      if (session?.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.phoneVerified = !!token.phoneVerified;
      }

      return session;
    },
  },
};
