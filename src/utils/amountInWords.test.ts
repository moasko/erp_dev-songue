import { describe, expect, it } from 'vitest'
import { amountInWords } from './amountInWords'

// Le montant en lettres figure sur les documents fiscaux et prime sur le
// montant chiffre en cas de litige : chaque regle du francais des nombres
// (80, 21, 100, mille invariable...) est verrouillee ici.

describe('amountInWords - regles du francais', () => {
  const cases: Array<[number, string]> = [
    [0, 'Zéro franc CFA'],
    [1, 'Un franc CFA'],
    [16, 'Seize francs CFA'],
    [17, 'Dix-sept francs CFA'],
    [20, 'Vingt francs CFA'],
    [21, 'Vingt-et-un francs CFA'],
    [31, 'Trente-et-un francs CFA'],
    [70, 'Soixante-dix francs CFA'],
    [71, 'Soixante-onze francs CFA'],
    [77, 'Soixante-dix-sept francs CFA'],
    [80, 'Quatre-vingts francs CFA'],
    [81, 'Quatre-vingt-un francs CFA'],
    [90, 'Quatre-vingt-dix francs CFA'],
    [91, 'Quatre-vingt-onze francs CFA'],
    [99, 'Quatre-vingt-dix-neuf francs CFA'],
    [100, 'Cent francs CFA'],
    [101, 'Cent-un francs CFA'],
    [200, 'Deux-cents francs CFA'],
    [203, 'Deux-cent-trois francs CFA'],
    [280, 'Deux-cent-quatre-vingts francs CFA'],
    [1000, 'Mille francs CFA'],
    [1001, 'Mille-un francs CFA'],
    [1100, 'Mille-cent francs CFA'],
    [2000, 'Deux-mille francs CFA'],
    [80000, 'Quatre-vingt-mille francs CFA'],
    [200000, 'Deux-cent-mille francs CFA'],
    [1000000, 'Un-million francs CFA'],
    [2000000, 'Deux-millions francs CFA'],
    [1000000000, 'Un-milliard francs CFA'],
    [2500000000, 'Deux-milliards-cinq-cents-millions francs CFA'],
    [1234567, 'Un-million-deux-cent-trente-quatre-mille-cinq-cent-soixante-sept francs CFA'],
  ]

  it.each(cases)('%d => %s', (value, expected) => {
    expect(amountInWords(value, 'XOF')).toBe(expected)
  })
})

describe('amountInWords - devises', () => {
  it('ecrit le singulier pour une unite', () => {
    expect(amountInWords(1, 'EUR')).toBe('Un euro')
  })

  it('ecrit les centimes pour les devises a subdivision', () => {
    expect(amountInWords(12.5, 'EUR')).toBe('Douze euros et cinquante centimes')
    expect(amountInWords(1.01, 'EUR')).toBe('Un euro et un centime')
  })

  it('ignore la subdivision pour le franc CFA (pas de centime)', () => {
    expect(amountInWords(1500, 'XOF')).toBe('Mille-cinq-cents francs CFA')
  })

  it('retombe sur le franc CFA pour une devise inconnue ou absente', () => {
    expect(amountInWords(5, undefined)).toBe('Cinq francs CFA')
    expect(amountInWords(5, 'ZZZ')).toBe('Cinq francs CFA')
  })

  it('gere les milliemes du dinar tunisien', () => {
    expect(amountInWords(1.5, 'TND')).toBe('Un dinar et cinq-cents millimes')
  })

  it('prefixe les montants negatifs', () => {
    expect(amountInWords(-200, 'XOF')).toBe('Moins deux-cents francs CFA')
  })
})
