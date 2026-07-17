// Seed de demonstration : remplit une boutique existante avec un jeu de
// donnees realiste (catalogue, clients, devis, factures, paiements, achats,
// caisse, RH, CRM) pour les demos commerciales.
//
// Usage : node scripts/seed-demo.mjs [slug]   (defaut : demo)
//
// Le compte utilisateur et la boutique doivent deja exister (inscription via
// l'application). Le script efface les donnees METIER de cette boutique puis
// reseme ; il ne touche ni aux utilisateurs, ni aux roles, ni aux autres
// boutiques.

import 'dotenv/config'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const slug = process.argv[2] || 'demo'

// Generateur pseudo-aleatoire deterministe : deux executions donnent le meme
// jeu de donnees (pratique pour les captures d'ecran et les tests).
let rngState = 20260717
function rng() {
  rngState = (rngState * 1103515245 + 12345) % 2 ** 31
  return rngState / 2 ** 31
}
const pick = (list) => list[Math.floor(rng() * list.length)]
const between = (min, max) => Math.floor(min + rng() * (max - min + 1))
const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000)
const daysAhead = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000)

// Meme algorithme que src/utils/documentTotals.ts : les montants stockes se
// reconcilient avec ce que l'application recalcule a l'affichage.
function computeTotals(lines, discountRate, defaultVatRate) {
  const lineTotal = (line) => Math.round(line.quantity * line.unitPrice)
  const subtotal = lines.reduce((sum, line) => sum + lineTotal(line), 0)
  const discount = Math.round(subtotal * (discountRate / 100))
  const taxable = Math.max(0, subtotal - discount)
  const grossByRate = new Map()
  for (const line of lines) {
    const rate = line.vatRate ?? defaultVatRate
    grossByRate.set(rate, (grossByRate.get(rate) ?? 0) + lineTotal(line))
  }
  const rates = Array.from(grossByRate.keys()).sort((a, b) => a - b)
  const bases = rates.map((rate) => subtotal === 0 ? 0 : Math.round((grossByRate.get(rate) * taxable) / subtotal))
  const gap = taxable - bases.reduce((sum, base) => sum + base, 0)
  if (gap !== 0 && bases.length > 0) bases[bases.indexOf(Math.max(...bases))] += gap
  const taxTotal = rates.reduce((sum, rate, index) => sum + Math.round(bases[index] * (rate / 100)), 0)
  return { subtotal, discount, taxable, taxTotal, total: taxable + taxTotal }
}

async function main() {
  const company = await prisma.company.findUnique({ where: { slug } })
  if (!company) throw new Error(`Boutique "${slug}" introuvable. Cree d'abord le compte via l'application.`)
  const owner = await prisma.companyMembership.findFirst({
    where: { companyId: company.id },
    include: { user: true },
    orderBy: { createdAt: 'asc' },
  })
  const actorId = owner?.user.id ?? null
  console.log(`Seed de la boutique "${company.name}" (${slug})...`)

  // --- Nettoyage des donnees metier de CETTE boutique uniquement ---
  const scope = { where: { companyId: company.id } }
  await prisma.payment.deleteMany(scope)
  await prisma.salesInvoice.deleteMany(scope)
  await prisma.purchaseInvoice.deleteMany(scope)
  await prisma.quote.deleteMany(scope)
  await prisma.transaction.deleteMany(scope)
  await prisma.bankAccount.deleteMany(scope)
  await prisma.stockMovement.deleteMany(scope)
  await prisma.warehouse.deleteMany(scope)
  await prisma.deal.deleteMany(scope)
  await prisma.lead.deleteMany(scope)
  await prisma.order.deleteMany(scope)
  await prisma.customer.deleteMany(scope)
  await prisma.catalogItem.deleteMany(scope)
  await prisma.category.deleteMany(scope)
  await prisma.employee.deleteMany(scope)
  await prisma.vendor.deleteMany(scope)
  await prisma.documentCounter.deleteMany(scope)
  await prisma.auditLog.deleteMany(scope)

  // --- Identite legale de la boutique ---
  await prisma.company.update({
    where: { id: company.id },
    data: {
      legalName: 'SANOGO & FILS SARL',
      address: 'Boulevard VGE, Marcory Zone 4\n01 BP 1234 Abidjan 01',
      phone: '+225 07 08 09 10 11',
      email: 'contact@sanogo-fils.ci',
      website: 'https://sanogo-fils.ci',
      taxId: 'CI-1902345 K',
      rccm: 'CI-ABJ-2019-B-08251',
      capital: '5 000 000 FCFA',
      taxRegime: 'Reel simplifie',
      vatRate: 18,
    },
  })
  await prisma.quoteSettings.upsert({
    where: { companyId: company.id },
    update: {},
    create: { companyId: company.id },
  })
  await prisma.quoteSettings.update({
    where: { companyId: company.id },
    data: {
      legalName: 'SANOGO & FILS SARL',
      address: 'Boulevard VGE, Marcory Zone 4\n01 BP 1234 Abidjan 01',
      phone: '+225 07 08 09 10 11',
      email: 'contact@sanogo-fils.ci',
      taxId: 'CI-1902345 K',
      rccm: 'CI-ABJ-2019-B-08251',
      capital: '5 000 000 FCFA',
      taxRegime: 'Reel simplifie',
      footerNote: 'Merci pour votre confiance. SANOGO & FILS, votre partenaire depuis 2019.',
      paymentTerms: 'Devis valable 30 jours. Paiement a 30 jours fin de mois par virement ou mobile money.',
      accentColor: '#0f766e',
    },
  })

  // --- Catalogue ---
  const categoriesSpec = [
    { name: 'Boissons', type: 'Product', color: 'amber' },
    { name: 'Alimentation', type: 'Product', color: 'emerald' },
    { name: 'Electronique', type: 'Product', color: 'blue' },
    { name: 'Hygiene & entretien', type: 'Product', color: 'violet' },
    { name: 'Prestations', type: 'Service', color: 'slate' },
  ]
  const categories = {}
  for (const spec of categoriesSpec) {
    categories[spec.name] = await prisma.category.create({ data: { companyId: company.id, ...spec } })
  }

  const itemsSpec = [
    // [nom, categorie, prix, cout, stock, minStock, tva]
    ['Eau minerale 1.5L (pack x6)', 'Boissons', 2500, 1800, 240, 48, 18],
    ['Jus d\'ananas local 1L', 'Boissons', 1500, 900, 85, 24, 18],
    ['Sucrerie 33cl (casier x24)', 'Boissons', 7200, 5400, 60, 12, 18],
    ['Cafe soluble 200g', 'Boissons', 3800, 2600, 45, 10, 18],
    ['Riz parfume 25kg', 'Alimentation', 22000, 17500, 110, 20, 0],
    ['Huile vegetale 5L', 'Alimentation', 9500, 7200, 75, 15, 0],
    ['Sucre en poudre 5kg', 'Alimentation', 4500, 3400, 90, 20, 0],
    ['Farine de ble 10kg', 'Alimentation', 7800, 6000, 55, 12, 0],
    ['Tomate concentree (carton x48)', 'Alimentation', 18500, 14000, 35, 8, 18],
    ['Lait en poudre 900g', 'Alimentation', 6200, 4700, 68, 15, 0],
    ['Smartphone A16 64Go', 'Electronique', 85000, 62000, 22, 5, 18],
    ['Ecouteurs Bluetooth', 'Electronique', 12000, 7500, 40, 10, 18],
    ['Chargeur universel 25W', 'Electronique', 6500, 3800, 55, 12, 18],
    ['Ampoule LED E27 (lot x4)', 'Electronique', 4800, 2900, 80, 20, 18],
    ['Rallonge 5 prises', 'Electronique', 5500, 3200, 34, 8, 18],
    ['Savon de Marseille (lot x6)', 'Hygiene & entretien', 3600, 2300, 120, 30, 18],
    ['Detergent liquide 5L', 'Hygiene & entretien', 6800, 4600, 48, 12, 18],
    ['Papier hygienique (pack x12)', 'Hygiene & entretien', 4200, 2800, 95, 25, 18],
    ['Eau de javel 2L', 'Hygiene & entretien', 1800, 1100, 70, 20, 18],
    ['Livraison Abidjan', 'Prestations', 3000, 0, null, null, 18],
    ['Installation electrique (forfait)', 'Prestations', 45000, 0, null, null, 18],
    ['Maintenance mensuelle boutique', 'Prestations', 60000, 0, null, null, 18],
    ['Conseil gestion de stock (jour)', 'Prestations', 80000, 0, null, null, 18],
  ]
  const items = []
  let skuIndex = 1
  for (const [name, cat, price, cost, stock, minStockLevel, vatRate] of itemsSpec) {
    const type = categories[cat].type
    items.push(await prisma.catalogItem.create({
      data: {
        companyId: company.id,
        type,
        sku: `${type === 'Service' ? 'SRV' : 'ART'}-${String(skuIndex++).padStart(4, '0')}`,
        name,
        categoryId: categories[cat].id,
        price,
        cost,
        wholesalePrice: Math.round(price * 0.88),
        stock,
        minStockLevel,
        vatRate,
        status: 'Active',
        createdAt: daysAgo(between(60, 90)),
      },
    }))
  }
  const products = items.filter((item) => item.type === 'Product')
  const services = items.filter((item) => item.type === 'Service')

  // --- Depot & stock initial ---
  const warehouse = await prisma.warehouse.create({
    data: {
      companyId: company.id,
      name: 'Depot principal Marcory',
      location: 'Marcory Zone 4, Abidjan',
      manager: 'Ibrahim Sanogo',
      capacity: 2000,
      usedCapacity: 1240,
      status: 'Active',
    },
  })
  for (const product of products) {
    await prisma.stockMovement.create({
      data: {
        companyId: company.id,
        warehouseId: warehouse.id,
        itemId: product.id,
        type: 'In',
        quantity: product.stock ?? 0,
        reference: `INIT-${product.sku}`,
        reason: 'Stock initial',
        status: 'Completed',
        date: daysAgo(between(55, 85)),
      },
    })
  }

  // --- Comptes de tresorerie ---
  const balances = new Map()
  async function createAccount(name, type, accountNumber) {
    const account = await prisma.bankAccount.create({
      data: { companyId: company.id, name, type, accountNumber, currency: 'FCFA', balance: 0, status: 'Active' },
    })
    balances.set(account.id, 0)
    return account
  }
  const caisse = await createAccount('Caisse boutique', 'Cash', null)
  const mobileMoney = await createAccount('Mobile money (Orange)', 'Cash', '07 08 09 10 11')
  const banque = await createAccount('Compte courant SGCI', 'Checking', 'CI93 SG 01234567890')

  async function addTransaction(account, { description, amount, type, category, reference, date }) {
    const transaction = await prisma.transaction.create({
      data: {
        companyId: company.id,
        accountId: account.id,
        description, amount, type, category,
        reference: reference ?? null,
        status: 'Completed',
        date,
        createdAt: date,
      },
    })
    balances.set(account.id, balances.get(account.id) + (type === 'Expense' ? -amount : amount))
    return transaction
  }

  // Apport initial pour que les soldes restent positifs malgre les depenses.
  await addTransaction(banque, { description: 'Apport en compte courant associes', amount: 6500000, type: 'Income', category: 'Apport', date: daysAgo(90) })
  await addTransaction(caisse, { description: 'Fonds de caisse initial', amount: 300000, type: 'Income', category: 'Apport', date: daysAgo(90) })

  // --- Clients ---
  const customerNames = [
    ['Kouassi Distribution', 'achats@kouassi-distrib.example.com'],
    ['Maquis Chez Tantie Alice', 'tantie.alice@example.com'],
    ['Hotel Les Cocotiers', 'reception@cocotiers.example.com'],
    ['Pharmacie du Rond-Point', 'pharmacie.rp@example.com'],
    ['Supermarche Prox Yopougon', 'prox.yop@example.com'],
    ['Ecole Sainte-Marie', 'intendance@sainte-marie.example.com'],
    ['Restaurant Le Wafou', 'lewafou@example.com'],
    ['Boulangerie Moderne Treichville', 'boulangerie.treich@example.com'],
    ['Cabinet Comptable N\'Guessan', 'cabinet.nguessan@example.com'],
    ['Garage Auto Plus Koumassi', 'autoplus@example.com'],
    ['Salon de coiffure Reine Pokou', 'reine.pokou@example.com'],
    ['ONG Sante Pour Tous', 'logistique@spt.example.com'],
    ['Traore Bâtiment SARL', 'traore.batiment@example.com'],
    ['Kiosque Mobile Adjame', 'kiosque.adjame@example.com'],
    ['Residence Meublee Bietry', 'residence.bietry@example.com'],
  ]
  const customers = []
  for (const [name, email] of customerNames) {
    customers.push(await prisma.customer.create({
      data: { companyId: company.id, name, email, createdAt: daysAgo(between(20, 88)) },
    }))
  }

  // --- Fournisseurs ---
  const vendorsSpec = [
    ['SODIPRA CI', 'Grossiste alimentaire', 'Moussa Diabate', 'Abidjan', 'Strategique', 'Faible'],
    ['CI Boissons SA', 'Boissons', 'Awa Bamba', 'Abidjan', 'Strategique', 'Faible'],
    ['TechImport Treichville', 'Electronique', 'Jean-Marc Koffi', 'Abidjan', 'Actif', 'Moyen'],
    ['Hygiene Plus SARL', 'Produits entretien', 'Fatou Cisse', 'Abidjan', 'Actif', 'Faible'],
    ['Transport Express Anyama', 'Logistique', 'Seydou Ouattara', 'Anyama', 'Actif', 'Moyen'],
    ['Imprimerie du Plateau', 'Fournitures', 'Clarisse Aka', 'Abidjan', 'A surveiller', 'Moyen'],
    ['Grossiste Adjame Marche', 'Divers', 'Bakary Kone', 'Abidjan', 'A surveiller', 'Eleve'],
    ['Energie Solaire CI', 'Equipement', 'Paul N\'Dri', 'Bingerville', 'Actif', 'Faible'],
  ]
  const vendors = []
  for (const [name, category, ownerName, city, status, risk] of vendorsSpec) {
    vendors.push(await prisma.vendor.create({
      data: {
        companyId: company.id,
        name, category, owner: ownerName, city,
        spend: `${(between(8, 90) * 100000).toLocaleString('fr-FR')} FCFA`,
        orders: between(3, 28),
        onTime: between(72, 100),
        quality: between(80, 100),
        risk, status,
        nextReview: daysAhead(between(30, 180)).toLocaleDateString('fr-FR'),
        contract: pick(['Contrat cadre annuel', 'Bons de commande', 'Contrat 6 mois']),
        paymentTerms: pick(['Comptant', '15 jours', '30 jours', '45 jours']),
        email: `contact@${name.toLowerCase().replace(/[^a-z]+/g, '-')}.example.com`,
        phone: `+225 0${between(1, 7)} ${between(10, 99)} ${between(10, 99)} ${between(10, 99)} ${between(10, 99)}`,
      },
    }))
  }

  // --- Factures d'achat ---
  const purchaseCategories = ['Achat stock', 'Transport', 'Loyer', 'Charges', 'Fournitures']
  let purchaseNumber = 1
  for (let i = 0; i < 12; i += 1) {
    const vendor = pick(vendors)
    const amount = between(80, 900) * 1000
    const issueDate = daysAgo(between(3, 75))
    const paid = i < 8 // 8 payees, 4 en attente
    const reference = `ACH-${String(purchaseNumber++).padStart(5, '0')}`
    const invoice = await prisma.purchaseInvoice.create({
      data: {
        companyId: company.id,
        vendorId: vendor.id,
        vendorName: vendor.name,
        reference,
        issueDate,
        dueDate: new Date(issueDate.getTime() + 30 * 864e5),
        status: paid ? 'Paid' : 'Pending',
        category: pick(purchaseCategories),
        totalCents: amount,
        paidCents: paid ? amount : 0,
        createdAt: issueDate,
      },
    })
    if (paid) {
      // Les gros achats fournisseurs partent du compte bancaire : une caisse
      // de boutique ne doit jamais finir negative dans le jeu de demo.
      const account = banque
      const transaction = await addTransaction(account, {
        description: `${vendor.name} - ${reference}`,
        amount, type: 'Expense', category: invoice.category, reference, date: issueDate,
      })
      await prisma.payment.create({
        data: {
          companyId: company.id, accountId: account.id, transactionId: transaction.id,
          purchaseInvoiceId: invoice.id, amount, direction: 'Out', method: account.type, reference, date: issueDate,
        },
      })
    }
  }

  // --- Devis ---
  function buildLines() {
    const count = between(2, 5)
    const lines = []
    const chosen = new Set()
    for (let i = 0; i < count; i += 1) {
      const item = pick(rng() < 0.75 ? products : services)
      if (chosen.has(item.id)) continue
      chosen.add(item.id)
      lines.push({
        itemId: item.id,
        description: item.name,
        quantity: item.type === 'Service' ? between(1, 3) : between(2, 30),
        unitPrice: item.price,
        vatRate: item.vatRate,
      })
    }
    return lines
  }

  const quoteStatuses = ['Accepted', 'Accepted', 'Accepted', 'Sent', 'Sent', 'Sent', 'Draft', 'Draft', 'Rejected', 'Expired', 'Accepted', 'Sent']
  const quotes = []
  let quoteNumber = 1
  for (const status of quoteStatuses) {
    const customer = pick(customers)
    const lines = buildLines()
    const discountRate = pick([0, 0, 0, 5, 10])
    const totals = computeTotals(lines, discountRate, 18)
    const issueDate = daysAgo(between(5, 80))
    const quote = await prisma.quote.create({
      data: {
        companyId: company.id,
        customerId: customer.id,
        reference: `DEV-${String(quoteNumber++).padStart(5, '0')}`,
        title: pick([
          'Approvisionnement mensuel', 'Commande de reassort', 'Equipement boutique',
          'Fournitures trimestrielles', 'Proposition commerciale', 'Commande evenement',
        ]),
        status,
        issueDate,
        validUntil: new Date(issueDate.getTime() + 30 * 864e5),
        discountRate,
        taxRate: 18,
        subtotalCents: totals.subtotal,
        totalCents: totals.total,
        terms: 'Devis valable 30 jours. Paiement a 30 jours fin de mois par virement ou mobile money.',
        acceptedAt: status === 'Accepted' ? new Date(issueDate.getTime() + between(2, 8) * 864e5) : null,
        createdAt: issueDate,
        lines: {
          create: lines.map((line, index) => ({
            itemId: line.itemId,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            totalCents: Math.round(line.quantity * line.unitPrice),
            vatRate: line.vatRate,
            sortOrder: index,
          })),
        },
      },
      include: { lines: true, customer: true },
    })
    quotes.push({ quote, lines, discountRate, totals })
  }

  // --- Factures de vente ---
  // 4 issues de devis acceptes + 12 directes ; statuts varies dont retards.
  let invoiceNumber = 1
  const acceptedQuotes = quotes.filter((entry) => entry.quote.status === 'Accepted')
  const invoiceSpecs = []
  for (const entry of acceptedQuotes) invoiceSpecs.push({ fromQuote: entry, kind: pick(['Paid', 'PartiallyPaid', 'Sent', 'Overdue']) })
  const directKinds = ['Paid', 'Paid', 'Paid', 'Paid', 'Paid', 'PartiallyPaid', 'PartiallyPaid', 'Sent', 'Sent', 'Overdue', 'Overdue', 'Draft']
  for (const kind of directKinds) invoiceSpecs.push({ fromQuote: null, kind })

  for (const spec of invoiceSpecs) {
    const source = spec.fromQuote
    const customer = source ? source.quote.customer : pick(customers)
    const lines = source ? source.lines : buildLines()
    const discountRate = source ? source.discountRate : pick([0, 0, 5])
    const totals = source ? source.totals : computeTotals(lines, discountRate, 18)
    const issueDate = source
      ? new Date(source.quote.acceptedAt.getTime() + between(1, 5) * 864e5)
      : daysAgo(between(2, 70))
    const overdue = spec.kind === 'Overdue'
    const dueDate = overdue
      ? new Date(Date.now() - between(5, 25) * 864e5)
      : new Date(issueDate.getTime() + 30 * 864e5)

    let paidCents = 0
    if (spec.kind === 'Paid') paidCents = totals.total
    if (spec.kind === 'PartiallyPaid' || (overdue && rng() < 0.5)) paidCents = Math.round(totals.total * pick([0.3, 0.5, 0.6]))

    const number = `FAC-${String(invoiceNumber++).padStart(5, '0')}`
    const invoice = await prisma.salesInvoice.create({
      data: {
        companyId: company.id,
        customerId: customer.id,
        quoteId: source ? source.quote.id : null,
        number,
        title: source ? source.quote.title : pick(['Vente comptoir gros', 'Commande livree', 'Prestation realisee', 'Reassort boutique']),
        issueDate,
        dueDate,
        status: spec.kind === 'Paid' ? 'Paid' : spec.kind === 'PartiallyPaid' ? 'PartiallyPaid' : spec.kind === 'Overdue' ? 'Overdue' : spec.kind,
        discountRate,
        taxRate: 18,
        subtotalCents: totals.subtotal,
        taxCents: totals.taxTotal,
        totalCents: totals.total,
        paidCents,
        terms: 'Paiement a 30 jours fin de mois par virement ou mobile money.',
        lastReminderAt: overdue && rng() < 0.5 ? daysAgo(between(1, 4)) : null,
        createdAt: issueDate,
        lines: {
          create: lines.map((line, index) => ({
            itemId: line.itemId,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            totalCents: Math.round(line.quantity * line.unitPrice),
            vatRate: line.vatRate,
            sortOrder: index,
          })),
        },
      },
    })

    if (paidCents > 0) {
      const account = pick([banque, mobileMoney, caisse])
      const paymentDate = new Date(issueDate.getTime() + between(1, 20) * 864e5)
      const transaction = await addTransaction(account, {
        description: `${customer.name} - ${number}`,
        amount: paidCents, type: 'Income', category: 'Ventes', reference: number, date: paymentDate,
      })
      await prisma.payment.create({
        data: {
          companyId: company.id, accountId: account.id, transactionId: transaction.id,
          salesInvoiceId: invoice.id, amount: paidCents, direction: 'In',
          method: account.type, reference: number, date: paymentDate,
        },
      })
    }
  }

  // --- Ventes caisse (POS) sur 30 jours ---
  for (let i = 0; i < 48; i += 1) {
    const account = pick([caisse, caisse, mobileMoney])
    const amount = between(2, 60) * 500
    const date = daysAgo(between(0, 30))
    await addTransaction(account, {
      description: `Vente caisse POS-${String(900100 + i)}`,
      amount, type: 'Income', category: 'POS',
      reference: `POS-${String(900100 + i)}`, date,
    })
  }

  // --- Depenses courantes ---
  const expensesSpec = [
    ['Loyer boutique Marcory', 250000, 'Loyer'],
    ['Facture CIE electricite', 68000, 'Charges'],
    ['Facture SODECI eau', 22000, 'Charges'],
    ['Carburant livraisons', 45000, 'Transport'],
    ['Credit telephone equipe', 15000, 'Charges'],
    ['Entretien climatisation', 35000, 'Charges'],
  ]
  for (const [description, amount, category] of expensesSpec) {
    // Loyer et grosses charges depuis la banque, le reste en caisse.
    await addTransaction(amount >= 60000 ? banque : caisse, {
      description, amount, type: 'Expense', category, date: daysAgo(between(1, 28)),
    })
  }

  // --- Soldes finaux des comptes ---
  for (const [accountId, balance] of balances) {
    await prisma.bankAccount.update({ where: { id: accountId }, data: { balance } })
  }

  // --- Compteurs de numerotation (la suite reprend apres les documents semes) ---
  await prisma.documentCounter.create({
    data: { companyId: company.id, kind: 'salesInvoice', nextNumber: invoiceNumber },
  })
  await prisma.documentCounter.create({
    data: { companyId: company.id, kind: 'purchaseInvoice', nextNumber: purchaseNumber },
  })
  await prisma.quoteSettings.update({
    where: { companyId: company.id },
    data: { nextNumber: quoteNumber },
  })

  // --- Equipe ---
  const employeesSpec = [
    ['Ibrahim', 'Sanogo', 'Direction', 'Gerant', 450000, 'Full-time'],
    ['Aminata', 'Kone', 'Ventes', 'Responsable boutique', 280000, 'Full-time'],
    ['Yao', 'Kouame', 'Ventes', 'Vendeur comptoir', 165000, 'Full-time'],
    ['Mariam', 'Toure', 'Ventes', 'Caissiere', 150000, 'Full-time'],
    ['Souleymane', 'Coulibaly', 'Logistique', 'Magasinier', 170000, 'Full-time'],
    ['Adjoua', 'N\'Guessan', 'Comptabilite', 'Assistante comptable', 220000, 'Full-time'],
    ['Moussa', 'Diarra', 'Logistique', 'Livreur', 140000, 'Part-time'],
    ['Grace', 'Aka', 'Ventes', 'Vendeuse stagiaire', 90000, 'Contract'],
  ]
  for (const [firstName, lastName, department, position, salary, type] of employeesSpec) {
    await prisma.employee.create({
      data: {
        companyId: company.id,
        firstName, lastName, department, position, salary, type,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/[^a-z]/g, '')}@sanogo-fils.ci`,
        phone: `+225 0${between(1, 7)} ${between(10, 99)} ${between(10, 99)} ${between(10, 99)} ${between(10, 99)}`,
        status: 'Active',
        hireDate: daysAgo(between(120, 1500)),
      },
    })
  }

  // --- CRM : opportunites et prospects ---
  const dealsSpec = [
    ['Contrat annuel approvisionnement hotel', 2400000, 'negotiation', 'High'],
    ['Equipement complet nouveau maquis', 850000, 'proposal', 'High'],
    ['Reassort trimestriel supermarche', 1200000, 'qualified', 'Medium'],
    ['Fourniture cantine scolaire', 950000, 'proposal', 'Medium'],
    ['Panier gourmand fin d\'annee', 400000, 'new', 'Low'],
    ['Installation solaire boutique annexe', 1800000, 'negotiation', 'High'],
    ['Contrat entretien residence', 720000, 'qualified', 'Medium'],
    ['Commande ouverture pharmacie annexe', 600000, 'new', 'Medium'],
  ]
  for (const [title, value, stageId, priority] of dealsSpec) {
    await prisma.deal.create({
      data: {
        companyId: company.id,
        contactId: pick(customers).id,
        title, value, stageId, priority,
        expectedCloseDate: daysAhead(between(10, 90)),
        status: 'Open',
      },
    })
  }
  const leadsSpec = [
    ['Kader Ouedraogo', 'Kiosque Port-Bouet', 'Website'],
    ['Solange Amani', 'Restaurant Le Jardin', 'Recommandation'],
    ['Franck Kossonou', 'Cyber-cafe Cocody', 'POS'],
    ['Rokia Sangare', 'Boutique Mode Adjame', 'Website'],
    ['Elie Tano', 'Eglise Baptiste Koumassi', 'Recommandation'],
    ['Nathalie Brou', 'Creche Les Anges', 'Salon professionnel'],
    ['Issouf Traore', 'Quincaillerie Abobo', 'POS'],
    ['Chantal Yapi', 'Salon Beaute Plus', 'Website'],
    ['Drissa Kone', 'Depot boissons Yopougon', 'Recommandation'],
    ['Estelle Gnamke', 'Patisserie Douceur', 'Salon professionnel'],
  ]
  let leadIndex = 0
  for (const [name, companyName, source] of leadsSpec) {
    leadIndex += 1
    await prisma.lead.create({
      data: {
        companyId: company.id,
        name, company: companyName, source,
        email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`,
        phone: `+225 0${between(1, 7)} ${between(10, 99)} ${between(10, 99)} ${between(10, 99)} ${between(10, 99)}`,
        status: leadIndex <= 3 ? 'Qualified' : leadIndex <= 7 ? 'Contacted' : 'New',
        score: between(20, 95),
        createdAt: daysAgo(between(1, 40)),
      },
    })
  }

  // --- Quelques traces d'audit pour le journal ---
  if (actorId) {
    const auditSamples = [
      ['quote.created', 'Quote', { reference: 'DEV-00001' }],
      ['invoice.created_from_quote', 'SalesInvoice', { number: 'FAC-00001', quoteReference: 'DEV-00001' }],
      ['invoice.payment_recorded', 'SalesInvoice', { number: 'FAC-00002' }],
      ['invoice.emailed', 'SalesInvoice', { number: 'FAC-00003' }],
      ['catalog.restocked', 'CatalogItem', { sku: 'ART-0001', quantity: 120 }],
    ]
    for (const [action, entity, metadata] of auditSamples) {
      await prisma.auditLog.create({
        data: {
          companyId: company.id, actorId, action, entity,
          entityId: 'seed', metadata: JSON.stringify(metadata),
          createdAt: daysAgo(between(0, 15)),
        },
      })
    }
  }

  const counts = {
    articles: items.length,
    clients: customers.length,
    fournisseurs: vendors.length,
    devis: quoteNumber - 1,
    factures: invoiceNumber - 1,
    achats: purchaseNumber - 1,
  }
  console.log('Seed termine :', JSON.stringify(counts))
  console.log('Soldes :', Array.from(balances.values()).map((balance) => balance.toLocaleString('fr-FR')).join(' / '))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
