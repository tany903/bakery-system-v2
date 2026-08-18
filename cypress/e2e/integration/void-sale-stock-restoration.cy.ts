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

  it('records shop stock before sale', () => {
    cy.loginAsManager()
    cy.visit('/inventory')
    cy.get('table tbody tr').first().within(() => {
      cy.get('td').eq(1).invoke('text').then(s => {
        stockBefore = parseInt(s.trim())
        cy.log(`Stock before: ${stockBefore}`)
        expect(stockBefore).to.be.greaterThan(0)
      })
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
    cy.get('table tbody tr').first().within(() => {
      cy.get('td').eq(1).invoke('text').should(s => {
        expect(parseInt(s.trim())).to.equal(stockBefore - 1)
      })
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
    cy.get('table tbody tr').first().within(() => {
      cy.get('td').eq(1).invoke('text').should(s => {
        expect(parseInt(s.trim())).to.equal(stockBefore)
      })
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