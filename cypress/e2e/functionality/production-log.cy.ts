describe('Production', () => {
  beforeEach(() => {
    cy.loginAsProduction()

    cy.visit('/production')

    cy.contains('h1', 'Production', {
      timeout: 15000,
    }).should('be.visible')
  })

  it('loads the production page', () => {
    cy.contains('h1', 'Production')
      .should('be.visible')

    cy.contains("Today's Production", {
      timeout: 15000,
    }).should('be.visible')
  })

  it('shows the record production button', () => {
    cy.contains(
      'button',
      /Record Production|Record First Batch/i,
      { timeout: 15000 }
    ).should('be.visible')
  })

  it('opens the log production modal', () => {
    cy.contains(
      'button',
      'Record Production'
    ).click()

    cy.get('.fixed.inset-0', {
      timeout: 10000,
    }).should('be.visible')

    cy.contains(
      'button',
      'Cancel'
    ).click()

    cy.get('.fixed.inset-0')
      .should('not.exist')
  })

  it('logs a production record', () => {
    cy.contains(
      'button',
      'Record Production'
    ).click()

    cy.get('.fixed.inset-0', {
      timeout: 10000,
    }).within(() => {
      cy.get('select')
        .first()
        .select(1)

      cy.get('input[type="number"]')
        .first()
        .type('5')

      cy.contains(
        'button',
        /^Log|^Save|^Confirm|^Record/
      ).click()
    })

    // The system does not display a success message.
    // Instead, verify that the production record
    // appears in Today's Production.

    cy.contains(
      "Today's Production",
      { timeout: 15000 }
    ).should('be.visible')

    cy.contains(
      '+5',
      { timeout: 15000 }
    ).should('be.visible')
  })

  it('shows production records after logging', () => {
    cy.contains(
      'button',
      'Record Production'
    ).click()

    cy.get('.fixed.inset-0', {
      timeout: 10000,
    }).within(() => {
      cy.get('select')
        .first()
        .select(1)

      cy.get('input[placeholder="e.g., 50"]')
        .type('5')

      cy.contains(
        'button',
        'Record Production'
      ).click()
    })

    cy.contains(
      "Today's Production",
      { timeout: 15000 }
    ).should('be.visible')

    cy.contains(
      '+5',
      { timeout: 15000 }
    ).should('be.visible')
  })

  it('shows production stat cards', () => {
  cy.contains(
    /Total Produced Today/i,
    { timeout: 15000 }
  ).should('be.visible')

  cy.contains(
    /Production Sessions/i,
    { timeout: 15000 }
  ).should('be.visible')

  cy.contains(
    /Unique Products/i,
    { timeout: 15000 }
  ).should('be.visible')

  cy.contains(
    /Most Produced/i,
    { timeout: 15000 }
  ).should('be.visible')
})
})