describe('[functionality test] Void Cash Register Entry', () => {
  it('manager can void a cash register entry', () => {
    // Create a cash-in entry to void
    cy.loginAsCashier()
    cy.contains('button', 'Cash').click()
    cy.contains('button', '+ Cash In').click()
    cy.contains('Cash In').parents('div').filter(':has(input[type="number"])').first()
      .within(() => {
        cy.get('input[type="number"]').type('50')
        cy.get('textarea').type('Cypress cash void test')
        cy.contains('button', '+ Confirm Cash In').click()
      })

    // Void it as manager
    cy.loginAsManager()
    cy.visit('/transactions')
    cy.contains('Cash Register Entries').scrollIntoView()

    cy.contains('Cash Register Entries')
      .parents('div')
      .filter(':has(table)')
      .first()
      .find('table tbody tr')
      .filter(':has(button:contains("Void"))')
      .first()
      .within(() => {
        cy.contains('button', 'Void').click()
      })

    cy.contains('Void Reason').should('be.visible')
    cy.contains('Void Reason').closest('div').find('select').select('Data entry error')
    cy.contains('button', 'Confirm Void').click()

    // no success toast — confirm modal closed and row now shows VOIDED
    cy.contains('Void Reason').should('not.exist')
    cy.contains('VOIDED', { timeout: 10000 }).should('be.visible')
  })

  it('voided cash entry shows VOIDED status', () => {
    cy.loginAsManager()
    cy.visit('/transactions')
    cy.contains('Cash Register Entries').scrollIntoView()
    cy.contains('VOIDED').should('be.visible')
  })
})