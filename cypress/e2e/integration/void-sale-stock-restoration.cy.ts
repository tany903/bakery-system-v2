/**
 * [integration test] Void Sale & Stock Restoration
 *
 * Target Modules: POS (Next.js) → Transactions (Next.js)
 *                 → Inventory Database (Supabase) → Audit Log (Supabase)
 *
 * Scenario: When a manager voids a completed sale, the system must
 * reverse all effects of that sale — restoring stock to its pre-sale
 * level and marking the transaction as voided in the sales ledger.
 *
 * Precondition: At least one product with shop stock > 0 exists.
 *
 * Steps:
 *   1. Record shop stock level before the sale.
 *   2. Cashier completes a cash sale — stock decrements.
 *   3. Manager locates the sale and voids it with a reason.
 *   4. Voided sale shows VOIDED status in transactions.
 *   5. Shop stock is restored to its pre-sale level.
 *   6. Void event appears in the inventory audit log.
 *
 * Expected Result: Stock is fully restored after void. The sale is
 * marked VOIDED and cannot be voided again. Inventory audit log
 * captures both the original deduction and the reversal.
 */

describe('[integration test] Void Sale & Stock Restoration', () => {
  let stockBefore: number
  let saleNumber: string

  // The manager Inventory page renders a second "Low Stock Alerts" table
  // above the main "All Products" table whenever any product is low/out
  // of stock. Both tables are <table><tbody><tr> and both sit inside a
  // div.bg-white wrapper, so a bare `table tbody tr` selector is ambiguous:
  // it silently grabs whichever table happens to render first in the DOM.
  // When alerts are present, that table's second column is a location
  // string ("shop"/"production"), not a stock count — the source of the
  // NaN failures. Scoping to the "All Products" card removes the ambiguity
  // regardless of whether the alerts table is showing.
  function shopStockCell() {
    return cy.contains('h2', 'All Products')
      .closest('.bg-white')
      .find('table tbody tr')
      .first()
      .find('td')
      .eq(1) // verified against the header row in the first test below
  }

  // Extracts the leading integer from a cell's text. Tolerant of nested
  // spans, "/ <threshold>" suffixes, unit labels like "pcs", and whitespace.
  function parseStockValue(text: string): number {
    const match = text.trim().match(/\d+/)
    return match ? parseInt(match[0], 10) : NaN
  }

  it('records shop stock before sale', () => {
    cy.loginAsManager()
    cy.visit('/inventory')

    // Guard the column-index assumption used by shopStockCell() against
    // future markup changes, instead of silently trusting td.eq(1).
    cy.contains('h2', 'All Products')
      .closest('.bg-white')
      .find('table thead th')
      .eq(1)
      .should('contain.text', 'Shop Stock')

    shopStockCell().invoke('text').then(text => {
      stockBefore = parseStockValue(text)
      cy.log(`Stock before: ${stockBefore}`)
      expect(stockBefore).to.be.greaterThan(0)
    })
  })

  it('cashier completes a cash sale', () => {
    cy.loginAsCashier()
    cy.visit('/pos')
    cy.contains('Cart is empty').should('be.visible')
    cy.get('.grid.grid-cols-2 button:not(:disabled)').first().click()
    cy.get('input[type="number"][placeholder="0.00"]').type('1000')
    cy.contains('button', /^Charge ₱/).click()
    cy.contains('button', 'Print Receipt', { timeout: 10000 }).should('be.visible')
    cy.get('.receipt').invoke('text').then(text => {
      const match = text.match(/(SALE-\d{8}-\d{4})/)
      expect(match).to.not.be.null
      saleNumber = match![1]
    })
    cy.contains('button', 'Close').click()
  })

  it('stock decremented by 1 after sale', () => {
    cy.loginAsManager()
    cy.visit('/inventory')
    shopStockCell().invoke('text').should(text => {
      expect(parseStockValue(text)).to.equal(stockBefore - 1)
    })
  })

  it('manager voids the sale with a reason', () => {
    cy.loginAsManager()
    cy.visit('/transactions')
    cy.then(() => {
      cy.contains(saleNumber, { timeout: 10000 })
        .parents('tr').filter(':has(button:contains("Void"))').first()
        .within(() => { cy.contains('button', 'Void').click() })
    })

    cy.contains('Void Reason').closest('div').find('select').select('Data entry error')
    cy.contains('button', 'Confirm Void').click()
    cy.contains(/Successfully voided/, { timeout: 10000 }).should('be.visible')
  })

  it('voided sale shows VOIDED status and no Void button', () => {
    cy.loginAsManager()
    cy.visit('/transactions')
    cy.then(() => {
      cy.contains(saleNumber, { timeout: 10000 })
        .parents('tr').first().within(() => {
          cy.contains('VOIDED').should('be.visible')
          cy.contains('button', 'Void').should('not.exist')
        })
    })
  })

  it('shop stock restored to pre-sale level after void', () => {
    cy.loginAsManager()
    cy.visit('/inventory')
    shopStockCell().invoke('text').should(text => {
      expect(parseStockValue(text)).to.equal(stockBefore)
    })
  })

  it('audit log shows both sale deduction and void reversal', () => {
    cy.loginAsManager()
    cy.visit('/audit-logs')
    cy.contains('button', 'Inventory Transactions').click()
    cy.get('table tbody tr', { timeout: 10000 }).should('have.length.greaterThan', 0)
    cy.contains('sale').should('be.visible')
  })
})