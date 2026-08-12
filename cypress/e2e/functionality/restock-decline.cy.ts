describe('Restock request decline flow', () => {
  const uniqueNote = `Cypress test request ${Date.now()}`

  it('lets a manager create a request, then production decline it with a reason', () => {
    cy.loginAsManager()
    cy.visit('/restock-requests')
    cy.contains('button', 'New Request').click()

    cy.get('.fixed.inset-0').within(() => {
      cy.get('select').first().select(1)
      cy.get('input[placeholder="e.g., 50"]').type('5')
      cy.get('textarea[placeholder="e.g., Needed before weekend, special event, etc."]').type(uniqueNote)
      cy.contains('button', /^Create Request/).click()
    })

    cy.contains('New Restock Request').should('not.exist')
    cy.contains(uniqueNote, { timeout: 10000 }).should('be.visible')

    cy.contains('button', 'Logout').click()

    cy.loginAsProduction()
    cy.visit('/restock-requests')
    cy.contains(uniqueNote, { timeout: 10000 })
      .parents('div').filter(':has(button:contains("Decline"))').first()
      .within(() => {
        cy.contains('button', 'Decline').click()
      })

    cy.get('.fixed.inset-0').within(() => {
      cy.contains('Select a reason for declining').should('be.visible')

      cy.get('select').select('Others')
      cy.contains('Specify Reason').should('be.visible')
      cy.get('textarea[placeholder="Enter a reason..."]').should('be.visible')

      cy.get('select').select('No stocks')
      cy.contains('button', 'Confirm Decline').click()
    })

    // The app's own success toast is a reliable signal that the decline
    // actually succeeded — more robust than re-finding the exact card in a
    // large, paginated, non-notes-searchable list afterward.
    cy.contains('Request declined', { timeout: 10000 }).should('be.visible')
  })
})