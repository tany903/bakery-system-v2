/**
 * [integration test] Cash Register Shift Reconciliation
 *
 * Target Modules: POS Checkout (Next.js) → Cash Register (Supabase)
 *
 * Scenario: Cash On Hand must always equal:
 *   starting float + today's cash sales + cash-in − cash-out.
 * A cash sale, a manual cash-in, and a manual cash-out in sequence
 * must each move the displayed total by exactly their own amount.
 *
 * Precondition: Cashier has access to the Cash Register widget.
 *
 * Steps:
 *   1. Record Cash On Hand before any action.
 *   2. Complete a ₱50 cash sale.
 *   3. Record a ₱200 manual Cash In.
 *   4. Record a ₱75 manual Cash Out.
 *   5. Verify Cash On Hand == before + saleAmount + 200 − 75.
 *
 * Expected Result: The register total is always mathematically
 * consistent — no entry is silently dropped, double-counted, or
 * applied with the wrong sign.
 */

describe('[integration test] Cash Register Shift Reconciliation', () => {
  let cashBefore: number
  let saleAmount: number

  function openCashRegister() {
    cy.contains('button', 'Cash').click()
    cy.contains('Cash On Hand').should('be.visible')
  }

  function readCashOnHand() {
    return cy.contains('Cash On Hand').parent().find('p.text-3xl').invoke('text').then(t => {
      const match = t.match(/₱([\d,]+\.\d{2})/)
      return match ? parseFloat(match[1].replace(/,/g, '')) : NaN
    })
  }

  it('records Cash On Hand before any action', () => {
    cy.loginAsCashier()
    cy.visit('/pos')
    openCashRegister()
    readCashOnHand().then(v => { cashBefore = v })
  })

  it('completes a cash sale', () => {
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
      cy.contains('button', 'Close').click()
    })
  })

  it('records a ₱200 manual Cash In', () => {
    cy.loginAsCashier()
    cy.visit('/pos')
    openCashRegister()
    cy.contains('button', '+ Cash In').click()
    // two nested '.fixed.inset-0' overlays exist at this point — the outer
    // Cash Register slide-over and the inner Cash In modal — target the last
    cy.get('.fixed.inset-0').last().within(() => {
      cy.get('input[type="number"]').type('200')
      cy.contains('button', '+ Confirm Cash In').click()
    })
    cy.get('.fixed.inset-0').should('have.length', 1)
  })

  it('records a ₱75 manual Cash Out', () => {
    cy.loginAsCashier()
    cy.visit('/pos')
    openCashRegister()
    cy.contains('button', '- Cash Out').click()
    cy.get('.fixed.inset-0').last().within(() => {
      cy.get('input[type="number"]').type('75')
      cy.contains('button', '- Confirm Cash Out').click()
    })
    cy.get('.fixed.inset-0').should('have.length', 1)
  })

  it('Cash On Hand reconciles to before + sale + 200 − 75', () => {
    cy.loginAsCashier()
    cy.visit('/pos')
    openCashRegister()
    cy.then(() => {
      const expected = Math.round((cashBefore + saleAmount + 200 - 75) * 100) / 100
      readCashOnHand().then(after => {
        expect(Math.round(after * 100) / 100).to.equal(expected)
      })
    })
  })
})