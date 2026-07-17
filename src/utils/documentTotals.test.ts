import { describe, expect, it } from 'vitest'
import { computeDocumentTotals } from './documentTotals'

// Ces totaux sont ecrits en base ET imprimes sur les documents fiscaux :
// l'invariant central est que tout se reconcilie (bases par taux = net apres
// remise, TTC = net + somme des TVA), quels que soient les arrondis.

describe('computeDocumentTotals - mono-taux', () => {
  it('calcule un document simple sans remise ni TVA', () => {
    const totals = computeDocumentTotals([{ quantity: 2, unitPrice: 1500 }], 0, 0)
    expect(totals.subtotal).toBe(3000)
    expect(totals.discount).toBe(0)
    expect(totals.taxable).toBe(3000)
    expect(totals.taxTotal).toBe(0)
    expect(totals.total).toBe(3000)
    // Taux 0 : pas de TVA, mais la base reste visible pour la ventilation.
    expect(totals.vatGroups).toEqual([{ rate: 0, base: 3000, tax: 0 }])
  })

  it('reproduit exactement l\'ancien calcul mono-taux (retrocompatibilite)', () => {
    // Ancien algorithme : tax = round(taxable * taux). Les devis existants ont
    // ete enregistres ainsi ; le nouveau calcul doit donner le meme resultat
    // quand toutes les lignes suivent le taux par defaut.
    const lines = [
      { quantity: 3, unitPrice: 4500 },
      { quantity: 1, unitPrice: 12000 },
    ]
    const totals = computeDocumentTotals(lines, 10, 18)
    const subtotal = 3 * 4500 + 12000 // 25500
    const discount = Math.round(subtotal * 0.1) // 2550
    const taxable = subtotal - discount // 22950
    const tax = Math.round(taxable * 0.18) // 4131
    expect(totals.subtotal).toBe(subtotal)
    expect(totals.discount).toBe(discount)
    expect(totals.taxable).toBe(taxable)
    expect(totals.taxTotal).toBe(tax)
    expect(totals.total).toBe(taxable + tax)
  })

  it('plafonne la remise a 100% du sous-total', () => {
    const totals = computeDocumentTotals([{ quantity: 1, unitPrice: 1000 }], 100, 18)
    expect(totals.taxable).toBe(0)
    expect(totals.taxTotal).toBe(0)
    expect(totals.total).toBe(0)
  })
})

describe('computeDocumentTotals - TVA par ligne', () => {
  it('ventile la TVA par taux', () => {
    const totals = computeDocumentTotals(
      [
        { quantity: 1, unitPrice: 10000, vatRate: 18 },
        { quantity: 1, unitPrice: 5000, vatRate: 0 },
      ],
      0,
      18,
    )
    expect(totals.vatGroups).toEqual([
      { rate: 0, base: 5000, tax: 0 },
      { rate: 18, base: 10000, tax: 1800 },
    ])
    expect(totals.taxTotal).toBe(1800)
    expect(totals.total).toBe(16800)
  })

  it('applique le taux par defaut aux lignes sans taux explicite', () => {
    const totals = computeDocumentTotals(
      [
        { quantity: 1, unitPrice: 10000 }, // suit le defaut 18
        { quantity: 1, unitPrice: 10000, vatRate: 9 },
      ],
      0,
      18,
    )
    expect(totals.vatGroups).toEqual([
      { rate: 9, base: 10000, tax: 900 },
      { rate: 18, base: 10000, tax: 1800 },
    ])
  })

  it('repartit la remise au prorata et les bases se reconcilient toujours', () => {
    // 3 taux, remise 7% : les arrondis par groupe ne doivent jamais faire
    // deriver la somme des bases du net apres remise.
    const totals = computeDocumentTotals(
      [
        { quantity: 1, unitPrice: 3333, vatRate: 18 },
        { quantity: 1, unitPrice: 6667, vatRate: 9 },
        { quantity: 1, unitPrice: 555, vatRate: 0 },
      ],
      7,
      0,
    )
    const baseSum = totals.vatGroups.reduce((sum, group) => sum + group.base, 0)
    expect(baseSum).toBe(totals.taxable)
    expect(totals.total).toBe(totals.taxable + totals.taxTotal)
  })

  it('reste reconcilie sur un balayage de remises et de montants', () => {
    // Propriete generale : pour toutes les combinaisons testees, la somme des
    // bases vaut le net apres remise et le TTC vaut net + TVA.
    for (let discount = 0; discount <= 100; discount += 13) {
      for (const price of [1, 99, 1001, 33333]) {
        const totals = computeDocumentTotals(
          [
            { quantity: 2, unitPrice: price, vatRate: 18 },
            { quantity: 1, unitPrice: price + 7, vatRate: 9 },
            { quantity: 3, unitPrice: 41, vatRate: 0 },
          ],
          discount,
          18,
        )
        const baseSum = totals.vatGroups.reduce((sum, group) => sum + group.base, 0)
        expect(baseSum).toBe(totals.taxable)
        expect(totals.total).toBe(totals.taxable + totals.taxTotal)
      }
    }
  })

  it('gere un document vide', () => {
    const totals = computeDocumentTotals([], 0, 18)
    expect(totals.subtotal).toBe(0)
    expect(totals.total).toBe(0)
    expect(totals.vatGroups).toEqual([])
  })
})
