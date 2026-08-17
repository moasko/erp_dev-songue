CREATE TABLE "PosRegister" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Active', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PosRegister_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PosSession" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "registerId" TEXT NOT NULL, "cashierId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Open', "openingBalance" INTEGER NOT NULL DEFAULT 0,
  "closingBalance" INTEGER, "expectedBalance" INTEGER, "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3), CONSTRAINT "PosSession_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PosTicket" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "sessionId" TEXT NOT NULL, "cashierId" TEXT NOT NULL,
  "customerId" TEXT, "transactionId" TEXT, "reference" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'Completed',
  "paymentMethod" TEXT NOT NULL, "subtotalCents" INTEGER NOT NULL, "discountCents" INTEGER NOT NULL DEFAULT 0,
  "taxCents" INTEGER NOT NULL DEFAULT 0, "totalCents" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PosTicket_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PosTicketLine" (
  "id" TEXT NOT NULL, "ticketId" TEXT NOT NULL, "itemId" TEXT, "sku" TEXT NOT NULL, "name" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL, "unitPrice" INTEGER NOT NULL, "totalCents" INTEGER NOT NULL,
  CONSTRAINT "PosTicketLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PosRegister_companyId_name_key" ON "PosRegister"("companyId", "name");
CREATE INDEX "PosRegister_companyId_status_idx" ON "PosRegister"("companyId", "status");
CREATE INDEX "PosSession_companyId_status_idx" ON "PosSession"("companyId", "status");
CREATE INDEX "PosSession_registerId_openedAt_idx" ON "PosSession"("registerId", "openedAt");
CREATE INDEX "PosSession_cashierId_idx" ON "PosSession"("cashierId");
CREATE UNIQUE INDEX "PosTicket_transactionId_key" ON "PosTicket"("transactionId");
CREATE UNIQUE INDEX "PosTicket_companyId_reference_key" ON "PosTicket"("companyId", "reference");
CREATE INDEX "PosTicket_companyId_createdAt_idx" ON "PosTicket"("companyId", "createdAt");
CREATE INDEX "PosTicket_sessionId_idx" ON "PosTicket"("sessionId");
CREATE INDEX "PosTicket_customerId_idx" ON "PosTicket"("customerId");
CREATE INDEX "PosTicketLine_ticketId_idx" ON "PosTicketLine"("ticketId");
CREATE INDEX "PosTicketLine_itemId_idx" ON "PosTicketLine"("itemId");
ALTER TABLE "PosRegister" ADD CONSTRAINT "PosRegister_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosSession" ADD CONSTRAINT "PosSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosSession" ADD CONSTRAINT "PosSession_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "PosRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosSession" ADD CONSTRAINT "PosSession_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosTicket" ADD CONSTRAINT "PosTicket_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosTicket" ADD CONSTRAINT "PosTicket_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PosSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosTicket" ADD CONSTRAINT "PosTicket_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosTicket" ADD CONSTRAINT "PosTicket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PosTicket" ADD CONSTRAINT "PosTicket_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PosTicketLine" ADD CONSTRAINT "PosTicketLine_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "PosTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosTicketLine" ADD CONSTRAINT "PosTicketLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
