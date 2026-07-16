-- Verification d'email a l'inscription
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- Les comptes crees avant cette migration n'ont jamais eu d'etape de verification :
-- on les considere verifies, sinon ils seraient bloques a la prochaine connexion.
UPDATE "User" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL;

CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");
CREATE INDEX "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");

ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Identite de la boutique choisie a l'etape 2 de l'inscription
ALTER TABLE "Company" ADD COLUMN "subdomain" TEXT;
ALTER TABLE "Company" ADD COLUMN "country" TEXT;
ALTER TABLE "Company" ADD COLUMN "currency" TEXT;
ALTER TABLE "Company" ADD COLUMN "locale" TEXT;

-- Les entreprises existantes gardent leur slug comme sous-domaine (il est deja unique).
UPDATE "Company" SET "subdomain" = "slug" WHERE "subdomain" IS NULL;

CREATE UNIQUE INDEX "Company_subdomain_key" ON "Company"("subdomain");
