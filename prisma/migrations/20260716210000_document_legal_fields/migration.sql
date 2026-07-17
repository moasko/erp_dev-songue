-- Mentions legales pour les documents fiscaux (facture normalisee, devis).
ALTER TABLE "Company" ADD COLUMN "rccm" TEXT;
ALTER TABLE "Company" ADD COLUMN "capital" TEXT;
ALTER TABLE "Company" ADD COLUMN "taxRegime" TEXT;
ALTER TABLE "Company" ADD COLUMN "vatRate" INTEGER;

ALTER TABLE "QuoteSettings" ADD COLUMN "rccm" TEXT;
ALTER TABLE "QuoteSettings" ADD COLUMN "capital" TEXT;
ALTER TABLE "QuoteSettings" ADD COLUMN "taxRegime" TEXT;
