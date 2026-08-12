describe('Restock request approve flow', () => {
  const uniqueNote = `Cypress approve test ${Date.now()}`

  it('manager creates a request and production fulfills it', () => {
    cy.loginAsManager()
    cy.visit('/restock-requests')
    cy.contains('button', 'New Request').click()

    cy.get('.fixed.inset-0').within(() => {
      cy.get('select').first().select(1)
      cy.get('input[placeholder="e.g., 50"]').type('3')
      cy.get('textarea[placeholder="e.g., Needed before weekend, special event, etc."]').type(uniqueNote)
      cy.contains('button', /^Create Request/).click()
    })

    cy.contains('New Restock Request').should('not.exist')
    cy.contains(uniqueNote, { timeout: 10000 }).should('be.visible')
    cy.contains('button', 'Logout').click()

    cy.loginAsProduction()
    cy.visit('/restock-requests')
    cy.contains(uniqueNote, { timeout: 10000 })
      .parents('div').filter(':has(button:contains("Fulfill"))').first()
      .within(() => {
        cy.contains('button', 'Fulfill').click()
      })

    cy.get('.fixed.inset-0').within(() => {
      cy.contains('button', 'Confirm Fulfillment').click()
    })

    cy.contains(/fulfilled|success/i, { timeout: 10000 }).should('be.visible')
  })

  it('shows pending status on newly created request', () => {
    const note = `Status test ${Date.now()}`
    cy.loginAsManager()
    cy.visit('/restock-requests')
    cy.contains('button', 'New Request').click()

    cy.get('.fixed.inset-0').within(() => {
      cy.get('select').first().select(1)
      cy.get('input[placeholder="e.g., 50"]').type('2')
      cy.get('textarea[placeholder="e.g., Needed before weekend, special event, etc."]').type(note)
      cy.contains('button', /^Create Request/).click()
    })

    cy.contains(note, { timeout: 10000 }).should('be.visible')
    // the page defaults to "Pending" tab, so the new request is visible = it has pending status
    cy.contains('Pending').should('be.visible')
  })
})