describe('[functionality test] Reservation Creation & Pickup Flow', () => {
  it('creates a reservation, then completes pickup and marks it Completed', () => {
    cy.loginAsCashier()

    cy.visit('/pos')

    cy.contains('button', 'Advance Order').click()

    cy.get('input[placeholder="e.g., Maria Santos"]')
      .type('Pickup Test Customer')

    // Select the first available orderable product
    cy.get('select').first().then($select => {
      const options = [...$select[0].options].filter(
        option => option.value !== ''
      )

      expect(
        options.length,
        'Advance Order must have at least one available product'
      ).to.be.greaterThan(0)

      cy.log(`Picking: "${options[0].text.trim()}"`)

      cy.get('select')
        .first()
        .select(options[0].value)
    })

    cy.get('input[placeholder="Quantity"]')
      .type('1')

    // Intercept reservation creation before clicking
    cy.intercept('POST', '**/rest/v1/reservations*').as('reservationCreated')

    cy.contains(
      'button',
      'Confirm Reservation & Collect Fee'
    ).click()

    cy.wait('@reservationCreated', { timeout: 10000 })
      .its('response.statusCode')
      .should('eq', 201)

    cy.contains(/Reservation created/, { timeout: 10000 })
      .should('be.visible')

    cy.visit('/reservations')

    cy.contains('Pickup Test Customer', { timeout: 10000 })
      .should('be.visible')

    cy.contains('Pickup Test Customer')
      .parents('div')
      .filter(':has(button:contains("Complete Pickup"))')
      .first()
      .within(() => {
        cy.contains('button', 'Complete Pickup').click()
      })

    cy.contains('Complete Pickup')
      .should('be.visible')

    cy.contains('button', '💵 Cash')
      .click()

    // Register pickup requests before confirming
    cy.intercept('POST', '**/rest/v1/sales*').as('saleCreated')
    cy.intercept('POST', '**/rest/v1/sale_items*').as('saleItemCreated')
    cy.intercept('GET', '**/rest/v1/products*').as('productFetch')
    cy.intercept('PATCH', '**/rest/v1/products*').as('stockUpdate')
    cy.intercept(
      'POST',
      '**/rest/v1/inventory_transactions*'
    ).as('inventoryLog')
    cy.intercept(
      'PATCH',
      '**/rest/v1/reservations*'
    ).as('reservationUpdated')

    cy.get('.fixed.inset-0')
      .find('button')
      .contains('Confirm')
      .should('not.be.disabled')
      .click()

    // Verify the pickup flow starts correctly
    cy.wait('@saleCreated', { timeout: 20000 })
      .its('response.statusCode')
      .should('eq', 201)

    cy.wait('@saleItemCreated', { timeout: 10000 })
      .its('response.statusCode')
      .should('eq', 201)

    cy.wait('@productFetch', { timeout: 10000 })
      .its('response.statusCode')
      .should('eq', 200)

    // Verify stock update if the pickup flow performs one
    cy.wait('@stockUpdate', { timeout: 10000 })
      .its('response.statusCode')
      .should('eq', 204)

    // Verify reservation is updated to completed
    cy.wait('@reservationUpdated', { timeout: 10000 })
      .its('response.statusCode')
      .should('eq', 204)

    cy.get('.fixed.inset-0', { timeout: 15000 })
      .should('not.exist')

    cy.contains(
      'Pickup completed — sale recorded',
      { timeout: 10000 }
    ).should('be.visible')

    cy.contains('button', /^Completed/)
      .click()

    cy.contains('Pickup Test Customer', { timeout: 10000 })
      .should('be.visible')
  })
})