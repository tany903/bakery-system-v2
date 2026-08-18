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
 *   3. The most recent sale record's total equals Fee + Balance.
 *
 * Expected Result: fee_amount + balance_amount === sale.total_amount.
 * The customer is never charged more or less than the original quote,
 * even though payment happened in two separate transactions.
 */

describe('[integration test] Reservation Deposit → Pickup → Sale Reconciliation', () => {
  let feeAmount: number
  let balanceAmount: number
  let totalAmount: number

  function extractPeso(text: string): number {
    const match = text.match(/₱([\d,]+\.\d{2})/)
    return match ? parseFloat(match[1].replace(/,/g, '')) : NaN
  }

  it('books an advance order and reads the fee/balance split', () => {
    cy.loginAsCashier()
    cy.visit('/pos')
    cy.contains('button', 'Advance Order').click()
    cy.contains('Reserve products with a 50% deposit').should('be.visible')

    cy.get('input[placeholder="e.g., Maria Santos"]').type('Reconciliation Test Customer')
    cy.get('select').first().select(1)
    cy.get('input[placeholder="Quantity"]').type('1')

    cy.contains('Total Order Value').parent().invoke('text').then(t => { totalAmount = extractPeso(t) })
    cy.contains('Fee to Collect Now (50%)').parent().invoke('text').then(t => { feeAmount = extractPeso(t) })
    cy.contains('Balance Due at Pickup').parent().invoke('text').then(t => { balanceAmount = extractPeso(t) })

    cy.contains('button', 'Confirm Reservation & Collect Fee').click()
    cy.contains(/Reservation created/, { timeout: 10000 }).should('be.visible')
  })

  it('completes pickup and the resulting sale equals fee + balance', () => {
    cy.loginAsCashier()
    cy.visit('/reservations')
    cy.contains('Reconciliation Test Customer', { timeout: 10000 }).should('be.visible')

    cy.contains('Reconciliation Test Customer').parents('div').filter(':has(button:contains("Complete Pickup"))').first()
      .within(() => {
        cy.contains('button', 'Complete Pickup').click()
      })

    cy.contains('Complete Pickup').should('be.visible')
    cy.contains('button', '💵 Cash').click()

    cy.intercept('PATCH', '**/rest/v1/reservations*').as('completePickup')
    cy.contains('button', /^Confirm — Collect ₱/).click()
    cy.wait('@completePickup', { timeout: 20000 })
    cy.contains('Pickup completed — sale recorded', { timeout: 10000 }).should('be.visible')

    cy.loginAsManager()
    cy.visit('/transactions')
    cy.contains('Sales').click()

    cy.then(() => {
      const expectedTotal = Math.round((feeAmount + balanceAmount) * 100) / 100
      expect(Math.round(totalAmount * 100) / 100).to.equal(expectedTotal)

      cy.get('table tbody tr').first().within(() => {
        cy.contains(`₱${expectedTotal.toFixed(2)}`).should('be.visible')
      })
    })
  })
})