describe('[functionality test] Void Production Record', () => {
  it('manager can void a production record', () => {
    // Create a production record first
    cy.loginAsProduction()
    cy.visit('/production')

    cy.contains('button', 'Record Production').click()

    cy.get('.fixed.inset-0').within(() => {
      cy.get('select').first().then($select => {
        const options = [...$select[0].options].filter(
          option => option.value !== ''
        )

        expect(
          options.length,
          'Production form must have at least one available product'
        ).to.be.greaterThan(0)

        cy.get('select')
          .first()
          .select(options[0].value)
      })

      cy.get('input[placeholder="e.g., 50"]')
        .type('3')

      // Intercept the actual production creation requests
      cy.intercept('PATCH', '**/rest/v1/products*')
        .as('productStockUpdate')

      cy.intercept('POST', '**/rest/v1/production*')
        .as('productionCreated')

      cy.intercept('POST', '**/rest/v1/inventory_transactions*')
        .as('inventoryLog')

      cy.contains('button', 'Record Production')
        .click()
    })

    // Wait for the actual database operations
    cy.wait('@productStockUpdate', { timeout: 10000 })
      .its('response.statusCode')
      .should('eq', 204)

    cy.wait('@productionCreated', { timeout: 10000 })
      .its('response.statusCode')
      .should('eq', 201)

    cy.wait('@inventoryLog', { timeout: 10000 })
      .its('response.statusCode')
      .should('eq', 201)

    // Open Transactions as Manager
    cy.loginAsManager()
    cy.visit('/transactions')

    cy.contains('button', 'Production Records')
      .click()

    // Find a production record that can be voided
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

    // Actual application request:
    // POST /api/transactions/void-production
    cy.intercept(
      'POST',
      '**/api/transactions/void-production'
    ).as('productionVoid')

    cy.contains('button', 'Confirm Void')
      .click()

    cy.wait('@productionVoid', { timeout: 10000 })
      .its('response.statusCode')
      .should('eq', 200)

    cy.contains(/Successfully voided/, { timeout: 10000 })
      .should('be.visible')
  })

  it('voided production record shows VOIDED status', () => {
    cy.loginAsManager()
    cy.visit('/transactions')

    cy.contains('button', 'Production Records')
      .click()

    cy.get('table tbody tr', { timeout: 10000 })
      .should('contain.text', 'VOIDED')
  })
})