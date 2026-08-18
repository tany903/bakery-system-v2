/**
 * [integration test] Dashboard Revenue Reconciliation
 *
 * Target Modules: POS Checkout (Next.js) → Transactions (Next.js)
 *                 → Manager Dashboard (Next.js)
 *
 * Scenario: The "Today's Sales" figure on the manager dashboard must
 * rise by exactly a new sale's amount, and fall by exactly that same
 * amount again once the sale is voided — proving voided sales are
 * correctly excluded from the revenue aggregate, not just hidden in
 * the transactions table.
 *
 * Precondition: At least one sellable product exists.
 *
 * Steps:
 *   1. Record Today's Sales on the dashboard before any action.
 *   2. Cashier completes a cash sale.
 *   3. Today's Sales increased by exactly the sale amount.
 *   4. Manager voids that sale.
 *   5. Today's Sales returns to its original pre-sale value.
 *
 * Expected Result: The dashboard aggregate never counts a voided
 * sale, whether it was voided seconds or minutes after being made.
 */

describe('[integration test] Dashboard Revenue Reconciliation', () => {
  let revenueBefore: number
  let saleAmount: number
  let saleNumber: string

  function readTodaysSales() {
    return cy.contains("Today's Sales").parent().find('p').eq(1).invoke('text').then(t => {
      const match = t.match(/₱([\d,]+\.\d{2})/)
      return match ? parseFloat(match[1].replace(/,/g, '')) : NaN
    })
  }

  it('records Today\'s Sales before any action', () => {
    cy.loginAsManager()
    cy.visit('/dashboard')
    readTodaysSales().then(v => { revenueBefore = v })
  })

  it('cashier completes a cash sale', () => {
    cy.loginAsCashier()
    cy.visit('/pos')
    cy.get('.grid.grid-cols-2 button:not(:disabled)').first().click()

    cy.contains('Total').parent().invoke('text').then(text => {
      const match = text.match(/₱([\d,]+\.\d{2})/)
      saleAmount = match ? parseFloat(match[1].replace(/,/g, '')) : 0
    })

    cy.then(() => {
      cy.get('input[type="number"]').first().clear().type(String(Math.ceil(saleAmount) + 100))
      cy.contains('button', /^Charge ₱/).should('not.be.disabled').click()
      cy.contains('button', 'Print Receipt', { timeout: 10000 }).should('be.visible')
      cy.get('.receipt').invoke('text').then(text => {
        const match = text.match(/(SALE-\d{8}-\d{4})/)
        saleNumber = match ? match[1] : ''
      })
      cy.contains('button', 'Close').click()
    })
  })

  it("Today's Sales increased by exactly the sale amount", () => {
    cy.loginAsManager()
    cy.visit('/dashboard')
    cy.then(() => {
      const expected = Math.round((revenueBefore + saleAmount) * 100) / 100
      readTodaysSales().then(after => {
        expect(Math.round(after * 100) / 100).to.equal(expected)
      })
    })
  })

  it('manager voids that sale', () => {
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

  it("Today's Sales returns to its pre-sale value after void", () => {
    cy.loginAsManager()
    cy.visit('/dashboard')
    cy.then(() => {
      readTodaysSales().then(after => {
        expect(Math.round(after * 100) / 100).to.equal(Math.round(revenueBefore * 100) / 100)
      })
    })
  })
})