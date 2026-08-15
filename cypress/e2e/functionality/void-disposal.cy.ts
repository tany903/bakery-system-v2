describe('[functionality test] Void Disposal Record', () => {
  it('manager can void a disposal record', () => {
    // Create a disposal first
    cy.loginAsCashier()
    cy.visit('/inventory')
    cy.get('table tbody tr').first().within(() => {
      cy.contains('button', 'Pull-out').click()
    })
    cy.get('.fixed.inset-0').within(() => {
      cy.get('select').find('option').not('[value=""]').first().then($opt => {
        cy.get('select').select($opt.val() as string)
      })
      cy.get('input[type="number"]').type('1')
      cy.contains('button', 'Confirm Pull-out').click()
    })
    // no success toast — instead confirm the modal closed, meaning the
    // pull-out request completed
    cy.get('.fixed.inset-0').should('not.exist')

    // Void it as manager
    cy.loginAsManager()
    cy.visit('/transactions')
    cy.contains('button', 'Disposals').click()

    cy.get('table tbody tr')
      .filter(':has(button:contains("Void"))')
      .first()
      .within(() => {
        cy.contains('button', 'Void').click()
      })

    cy.contains('Void Reason').should('be.visible')
    cy.contains('Void Reason').closest('div').find('select').select('Data entry error')
    cy.contains('button', 'Confirm Void').click()

    // no success toast here either — confirm the modal closed and the row
    // now shows VOIDED status instead
    cy.contains('Void Reason').should('not.exist')
    cy.contains('VOIDED', { timeout: 10000 }).should('be.visible')
  })

  it('voided disposal record shows VOIDED status', () => {
    cy.loginAsManager()
    cy.visit('/transactions')
    cy.contains('button', 'Disposals').click()
    cy.contains('VOIDED').should('be.visible')
  })
})