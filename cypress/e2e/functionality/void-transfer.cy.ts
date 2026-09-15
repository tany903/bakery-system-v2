describe('[functionality test] Void Stock Transfer', () => {
  function getProductsTable() {
    return cy.contains('h2', 'All Products')
      .parents('div.bg-white')
      .find('table')
  }

  it('manager can void a stock transfer', () => {
    // Create a transfer first
    cy.loginAsManager()
    cy.visit('/inventory')

    getProductsTable()
      .find('tbody tr')
      .first()
      .within(() => {
        cy.contains('button', 'Transfer').click()
      })

    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[type="number"]')
        .clear()
        .type('1')

      cy.contains('button', 'Confirm Transfer')
        .click()
    })

    cy.contains(/transferred|success/i, { timeout: 10000 })
      .should('be.visible')

    // Open transactions
    cy.visit('/transactions')

    cy.contains('button', 'Stock Transfers')
      .click()

    // Find a transfer that can be voided
    cy.get('table tbody tr', { timeout: 10000 })
      .filter(':has(button:contains("Void"))')
      .first()
      .within(() => {
        cy.contains('button', 'Void')
          .click()
      })

    cy.contains('Void Reason')
      .should('be.visible')

    cy.contains('Void Reason')
      .closest('div')
      .find('select')
      .select('Data entry error')

    cy.contains('button', 'Confirm Void')
      .click()

    cy.contains(/Successfully voided/, { timeout: 10000 })
      .should('be.visible')
  })

  it('voided stock transfer shows VOIDED status', () => {
    cy.loginAsManager()
    cy.visit('/transactions')

    cy.contains('button', 'Stock Transfers')
      .click()

    cy.get('table tbody tr', { timeout: 10000 })
      .should('contain.text', 'VOIDED')
  })
})