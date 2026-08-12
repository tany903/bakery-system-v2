describe('Reservation pickup flow', () => {
  it('creates a reservation, then completes pickup and marks it Completed', () => {
    cy.loginAsCashier()

    cy.contains('button', 'Advance Order').click()
    cy.get('input[placeholder="e.g., Maria Santos"]').type('Pickup Test Customer')
    cy.get('select').first().select(1)
    cy.get('input[placeholder="Quantity"]').type('1')
    cy.contains('button', 'Confirm Reservation & Collect Fee').click()
    cy.contains(/Reservation created/, { timeout: 10000 }).should('be.visible')

    cy.visit('/reservations')
    cy.contains('Pickup Test Customer', { timeout: 10000 }).should('be.visible')

    cy.contains('Pickup Test Customer').parents('div').filter(':has(button:contains("Complete Pickup"))').first()
      .within(() => {
        cy.contains('button', 'Complete Pickup').click()
      })

    cy.contains('Complete Pickup').should('be.visible')
    cy.contains('button', '💵 Cash').click()
    cy.contains('button', /^Confirm — Collect ₱/).click()

    cy.contains('Pickup completed — sale recorded', { timeout: 10000 }).should('be.visible')

    cy.contains('button', /^Completed/).click()
    cy.contains('Pickup Test Customer', { timeout: 10000 }).should('be.visible')
  })
})