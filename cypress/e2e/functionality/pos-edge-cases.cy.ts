describe('[functionality test] POS Out-of-Stock & Edge Cases', () => {
  /**
   * Target Feature: POS Product Availability & Cart Limits
   * Verifies: out of stock products can't be added, stock limit enforced,
   * empty cart blocks payment, search shows no results for unknown product
   */

  before(() => {
    // Guarantee at least one product has 0 shop stock, so "out of stock" tests
    // aren't dependent on whatever the seed data happens to look like.
    cy.loginAsManager()
    cy.visit('/inventory')

    cy.get('table tbody tr').first().within(() => {
      cy.get('td').eq(1).invoke('text').then(text => {
        const currentStock = parseInt(text.trim())
        if (currentStock > 0) {
          cy.contains('button', 'Shop').click()
        }
      })
    })

    cy.get('body').then($body => {
      if ($body.find('.fixed.inset-0').length > 0) {
        cy.get('.fixed.inset-0').within(() => {
          cy.contains('p', 'Current Stock').next().invoke('text').then(stockText => {
            const stock = parseInt(stockText.trim())
            cy.get('input[type="number"]').type(String(-stock))
            cy.contains('button', 'Confirm Adjustment').click()
          })
        })
        cy.get('.fixed.inset-0', { timeout: 10000 }).should('not.exist')
      }
    })
  })

  beforeEach(() => {
    cy.loginAsCashier()
    cy.contains('Cart is empty').should('be.visible')
  })

  it('cannot charge when cart is empty', () => {
    cy.contains('button', /^Charge ₱/).should('not.exist')
  })

  it('charge button appears only after adding item', () => {
    cy.get('.grid.grid-cols-2 button:not(:disabled)').first().click()
    cy.contains('button', /^Charge ₱/).should('be.visible')
  })

  it('out of stock products show as disabled', () => {
    cy.get('.grid.grid-cols-2 button:disabled').should('exist')
  })

  it('shows error when trying to exceed available stock', () => {
    cy.get('.grid.grid-cols-2 button:not(:disabled)').first().as('productBtn')

    cy.get('@productBtn').invoke('text').then(text => {
      const match = text.match(/Stock:\s*(\d+)/)
      const stock = match ? parseInt(match[1]) : 0

      cy.get('@productBtn').click()

      // clicking '+' exactly `stock` times guarantees quantity (1 + stock) exceeds stock
      for (let i = 0; i < stock; i++) {
        cy.contains('button', '+').first().click({ force: true })
      }
    })

    cy.contains(/Only \d+ available/i, { timeout: 5000 }).should('be.visible')
  })

  it('search with no match shows no products found', () => {
    cy.get('input[placeholder="Search products..."]').type('zzzznotreal123')
    cy.contains('No products found').should('be.visible')
  })

  it('clears error message after timeout', () => {
    cy.get('.grid.grid-cols-2 button:not(:disabled)').first().as('productBtn')

    cy.get('@productBtn').invoke('text').then(text => {
      const match = text.match(/Stock:\s*(\d+)/)
      const stock = match ? parseInt(match[1]) : 0

      cy.get('@productBtn').click()

      for (let i = 0; i < stock; i++) {
        cy.contains('button', '+').first().click({ force: true })
      }
    })

    cy.contains(/Only \d+ available/i, { timeout: 5000 }).should('be.visible')
    // error auto-clears after 3 seconds
    cy.contains(/Only \d+ available/i, { timeout: 5000 }).should('not.exist')
  })

  it('total updates correctly when quantity changes', () => {
    cy.get('.grid.grid-cols-2 button:not(:disabled)').first().click()

    let price1: number
    cy.contains('Total').parent().invoke('text').then(text => {
      const match = text.match(/₱([\d,]+\.\d{2})/)
      price1 = match ? parseFloat(match[1].replace(/,/g, '')) : 0
    })

    cy.contains('button', '+').first().click()

    cy.contains('Total').parent().invoke('text').then(text => {
      const match = text.match(/₱([\d,]+\.\d{2})/)
      const price2 = match ? parseFloat(match[1].replace(/,/g, '')) : 0
      expect(price2).to.equal(price1 * 2)
    })
  })
})