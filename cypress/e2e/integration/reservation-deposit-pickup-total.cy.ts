/**
 * [integration test] Reservation Deposit → Pickup → Sale Reconciliation
 *
 * Target Modules: POS Advance Order (Next.js) → Reservations (Supabase)
 *                 → Sales Ledger (Supabase)
 *
 * Scenario: The full order value split across two moments — a 50%
 * deposit collected at booking and the remaining balance collected
 * at pickup — must ultimately be recorded as a single sale equal to
 * the complete order value, not just the balance.
 *
 * Precondition: At least one product is orderable via Advance Order.
 *
 * Steps:
 *   1. Cashier books an advance order — reads Total, Fee (50%), Balance.
 *   2. Cashier completes pickup for that reservation, paying cash.
 *   3. Verify the sale record's total equals Fee + Balance.
 *
 * Expected Result: fee_amount + balance_amount === sale.total_amount.
 * The customer is never charged more or less than the original quote,
 * even though payment happened in two separate transactions.
 */

const RECONCILIATION_CUSTOMER = 'Reconciliation Test Customer'

function extractPeso(text: string): number {
  const match = text.match(/₱([\d,]+\.\d{2})/)
  return match ? parseFloat(match[1].replace(/,/g, '')) : NaN
}

describe('[integration test] Reservation Deposit → Pickup → Sale Reconciliation', () => {

  // Values captured in the first it block, consumed by the second and third.
  // Cypress.env() persists across it blocks within the same spec run.
  before(() => {
    Cypress.env('reconcile_fee', NaN)
    Cypress.env('reconcile_balance', NaN)
    Cypress.env('reconcile_total', NaN)
  })

  it('books an advance order and captures the fee/balance split', () => {
    cy.loginAsCashier()
    cy.visit('/pos')
    cy.contains('button', 'Advance Order').click()
    cy.contains('Reserve products with a 50% deposit').should('be.visible')

    cy.get('input[placeholder="e.g., Maria Santos"]').type(RECONCILIATION_CUSTOMER)

    // Pick the first available option in the Advance Order select —
    // the dropdown already filters to orderable products so whatever
    // is in it is valid to pick
    cy.get('select').first().then($select => {
      const options = [...$select[0].options].filter(opt => opt.value !== '')
      expect(options.length, 'Advance Order select must have at least one product').to.be.greaterThan(0)
      cy.log(`Picking: "${options[0].text.trim()}"`)
      cy.get('select').first().select(options[0].value)
    })

    cy.get('input[placeholder="Quantity"]').type('1')

    cy.contains('Total Order Value').parent().invoke('text').then(t => {
      Cypress.env('reconcile_total', extractPeso(t))
      cy.log(`Total: ${Cypress.env('reconcile_total')}`)
    })
    cy.contains('Fee to Collect Now (50%)').parent().invoke('text').then(t => {
      Cypress.env('reconcile_fee', extractPeso(t))
      cy.log(`Fee: ${Cypress.env('reconcile_fee')}`)
    })
    cy.contains('Balance Due at Pickup').parent().invoke('text').then(t => {
      Cypress.env('reconcile_balance', extractPeso(t))
      cy.log(`Balance: ${Cypress.env('reconcile_balance')}`)
    })

    cy.intercept('POST', '**/rest/v1/reservations**').as('reservationCreated')
    cy.contains('button', 'Confirm Reservation & Collect Fee').click()
    cy.wait('@reservationCreated', { timeout: 10000 })
      .its('response.statusCode').should('eq', 201)
    cy.contains(/Reservation created/, { timeout: 10000 }).should('be.visible')
  })

  it('completes pickup and verifies reservation moves to Completed', () => {
    // Guard: booking test must have run successfully
    const fee     = Cypress.env('reconcile_fee')
    const balance = Cypress.env('reconcile_balance')
    const total   = Cypress.env('reconcile_total')
    expect(fee,     'fee must be set from booking test').to.be.a('number').and.not.be.NaN
    expect(balance, 'balance must be set from booking test').to.be.a('number').and.not.be.NaN
    expect(total,   'total must be set from booking test').to.be.a('number').and.not.be.NaN

    cy.loginAsCashier()
    cy.visit('/reservations')
    cy.contains(RECONCILIATION_CUSTOMER, { timeout: 10000 }).should('be.visible')

    cy.contains(RECONCILIATION_CUSTOMER)
      .parents('div')
      .filter(':has(button:contains("Complete Pickup"))')
      .first()
      .within(() => {
        cy.contains('button', 'Complete Pickup').click()
      })

    cy.contains('Complete Pickup').should('be.visible')
    cy.contains('button', '💵 Cash').click()

    // Intercept every network call inside completeReservationPickup in order
    // so a failure at any step surfaces immediately with a clear status code
    cy.intercept('POST', '**/rest/v1/sales**').as('saleCreated')
    cy.intercept('GET',  '**/rest/v1/products**').as('productFetch')
    cy.intercept('PATCH', '**/rest/v1/products**').as('stockUpdate')
    cy.intercept('POST', '**/rest/v1/inventory_transactions**').as('inventoryLog')
    cy.intercept('PATCH', '**/rest/v1/reservations**').as('reservationUpdated')

    cy.get('.fixed.inset-0')
      .find('button')
      .contains('Confirm')
      .should('not.be.disabled')
      .click()

    cy.wait('@saleCreated', { timeout: 20000 }).then(i => {
      cy.log(`Sale INSERT: ${i.response?.statusCode}`)
      expect(i.response?.statusCode).to.eq(201)
    })
    cy.wait('@productFetch', { timeout: 10000 }).then(i => {
      cy.log(`Product GET: ${i.response?.statusCode}`)
      expect(i.response?.statusCode).to.eq(200)
    })
    cy.wait('@stockUpdate', { timeout: 10000 }).then(i => {
      cy.log(`Stock PATCH: ${i.response?.statusCode}`)
      expect(i.response?.statusCode).to.eq(204)
    })
    cy.wait('@inventoryLog', { timeout: 10000 }).then(i => {
      cy.log(`Inventory POST: ${i.response?.statusCode}`)
      expect(i.response?.statusCode).to.eq(201)
    })
    cy.wait('@reservationUpdated', { timeout: 10000 }).then(i => {
      cy.log(`Reservation PATCH: ${i.response?.statusCode}`)
      expect(i.response?.statusCode).to.eq(204)
    })

    // Modal must close after all steps complete without error
    cy.get('.fixed.inset-0', { timeout: 15000 }).should('not.exist')

    // Reservation card must appear in the Completed tab
    cy.contains('button', 'Completed').click()
    cy.contains(RECONCILIATION_CUSTOMER, { timeout: 8000 }).should('be.visible')
    cy.contains(RECONCILIATION_CUSTOMER)
      .parents('div')
      .first()
      .within(() => {
        cy.contains('button', 'Complete Pickup').should('not.exist')
      })
  })

  it('verifies sale total equals fee + balance in the transactions ledger', () => {
    const fee     = Cypress.env('reconcile_fee')     as number
    const balance = Cypress.env('reconcile_balance') as number
    const total   = Cypress.env('reconcile_total')   as number

    // Guard: both previous tests must have run successfully
    expect(fee,     'fee must be set from booking test').to.be.a('number').and.not.be.NaN
    expect(balance, 'balance must be set from booking test').to.be.a('number').and.not.be.NaN
    expect(total,   'total must be set from booking test').to.be.a('number').and.not.be.NaN

    const expectedTotal = Math.round((fee + balance) * 100) / 100

    // Core assertion: the two halves must sum to the original quoted total
    expect(Math.round(total * 100) / 100).to.equal(expectedTotal)
    cy.log(`fee(${fee}) + balance(${balance}) = ${expectedTotal}`)

    cy.loginAsManager()
    cy.visit('/transactions')
    cy.contains('Sales').click()

    // The sale record in the ledger must reflect the full order value,
    // not just the balance collected at pickup
    cy.get('table tbody tr', { timeout: 10000 }).first().within(() => {
      cy.contains(`₱${expectedTotal.toFixed(2)}`).should('be.visible')
    })
  })
})