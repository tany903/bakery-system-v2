describe('Void a sale transaction', () => {
  it('creates a cash sale, then a manager voids it with a reason', () => {
    cy.loginAsCashier()
    cy.get('.grid.grid-cols-2 button:not(:disabled)').first().click()
    cy.get('input[type="number"][placeholder="0.00"]').type('1000')
    cy.contains('button', /^Charge ₱/).click()
    cy.contains('button', 'Print Receipt', { timeout: 10000 })
    cy.get('.receipt').invoke('text').then(text => {
      const match = text.match(/(SALE-\d{8}-\d{4})/)
      cy.wrap(match ? match[1] : '').as('saleNumber')
    })
    cy.contains('button', 'Close').click()
    cy.contains('button', 'Logout').click()

    cy.loginAsManager()
    cy.visit('/transactions')

    cy.get('@saleNumber').then(saleNumber => {
      cy.contains(saleNumber as unknown as string, { timeout: 10000 })
        .parents('tr').filter(':has(button:contains("Void"))').first()
        .within(() => {
          cy.contains('button', 'Void').click()
        })
    })

    cy.contains('Void Reason').should('be.visible')
    cy.contains('Void Reason')
      .closest('div')
      .find('select')
      .select('Data entry error')
    cy.contains('button', 'Confirm Void').click()

    cy.contains(/Successfully voided/, { timeout: 10000 }).should('be.visible')
    cy.contains('VOIDED').should('be.visible')
  })
})