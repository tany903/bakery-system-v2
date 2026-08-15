describe('[functionality test] Void Production Record', () => {
  it('manager can void a production record', () => {
    // Create a production record first
    cy.loginAsProduction()
    cy.visit('/production')
    cy.contains('button', 'Record Production').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('select').first().select(1)
      cy.get('input[placeholder="e.g., 50"]').type('3')
      cy.contains('button', 'Record Production').click()
    })
    cy.contains(/success|recorded/i, { timeout: 10000 }).should('be.visible')

    // Void it as manager
    cy.loginAsManager()
    cy.visit('/transactions')
    cy.contains('button', 'Production Records').click()

    cy.get('table tbody tr')
      .filter(':has(button:contains("Void"))')
      .first()
      .within(() => {
        cy.contains('button', 'Void').click()
      })

    cy.contains('Void Reason').should('be.visible')
    cy.contains('Void Reason').closest('div').find('select').select('Data entry error')
    cy.contains('button', 'Confirm Void').click()
    cy.contains(/Successfully voided/, { timeout: 10000 }).should('be.visible')
  })

  it('voided production record shows VOIDED status', () => {
    cy.loginAsManager()
    cy.visit('/transactions')
    cy.contains('button', 'Production Records').click()
    cy.contains('VOIDED').should('be.visible')
  })
})