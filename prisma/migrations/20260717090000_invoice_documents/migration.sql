-- Factures de vente completes : lignes, TVA par ligne, lien devis -> facture,
-- numerotation sequentielle garantie et relances d'impayes.

-- TVA par ligne (null = taux par defaut du document / de la societe).
ALTER TABLE "CatalogItem" ADD COLUMN "vatRate" INTEGER;
ALTER TABLE "QuoteLine" ADD COLUMN "vatRate" INTEGER;

-- La facture devient un document a part entiere (comme le devis).
ALTER TABLE "SalesInvoice" ADD COLUMN "quoteId" TEXT;
ALTER TABLE "SalesInvoice" ADD COLUMN "title" TEXT;
ALTER TABLE "SalesInvoice" ADD COLUMN "discountRate" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SalesInvoice" ADD COLUMN "taxRate" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SalesInvoice" ADD COLUMN "terms" TEXT;
ALTER TABLE "SalesInvoice" ADD COLUMN "lastReminderAt" TIMESTAMP(3);

CREATE INDEX "SalesInvoice_quoteId_idx" ON "SalesInvoice"("quoteId");

ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_quoteId_fkey"
  FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Lignes de facture.
CREATE TABLE "InvoiceLine" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "itemId" TEXT,
  "description" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" INTEGER NOT NULL,
  "totalCents" INTEGER NOT NULL,
  "vatRate" INTEGER,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");
CREATE INDEX "InvoiceLine_itemId_idx" ON "InvoiceLine"("itemId");

ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Compteur de numerotation par type de document.
CREATE TABLE "DocumentCounter" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "nextNumber" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DocumentCounter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentCounter_companyId_kind_key" ON "DocumentCounter"("companyId", "kind");

ALTER TABLE "DocumentCounter" ADD CONSTRAINT "DocumentCounter_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
