describe('[functionality test] Ingredients Management', () => {
  /**
   * Target Feature: Ingredients Module
   * Verifies: add, edit, archive, restore, and search ingredients
   */

  beforeEach(() => {
    cy.loginAsManager()
    cy.visit('/ingredients')
    cy.contains('Ingredients').should('be.visible')
  })

  it('loads the ingredients page with list', () => {
    cy.get('table tbody tr').should('have.length.greaterThan', 0)
  })

  it('shows ingredient name, unit and stock columns', () => {
    cy.contains(/Ingredient/i).should('be.visible')
    cy.contains(/Unit/i).should('be.visible')
    cy.contains(/Stock/i).should('be.visible')
  })

  it('opens add ingredient modal with correct fields', () => {
    cy.contains('button', 'Add Ingredient').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[placeholder="e.g., Flour, Sugar, Eggs"]').should('be.visible')
      cy.get('input[placeholder="e.g., kg, liters, pieces"]').should('be.visible')
      cy.get('input[placeholder="e.g., 50"]').should('be.visible')
      cy.contains('button', 'Add Ingredient').should('be.visible')
    })
    cy.contains('button', 'Cancel').click()
  })

  it('adds a new ingredient and it appears in the list', () => {
    const name = `Cypress Ingredient ${Date.now()}`
    cy.contains('button', 'Add Ingredient').click()

    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[placeholder="e.g., Flour, Sugar, Eggs"]').type(name)
      cy.get('input[placeholder="e.g., kg, liters, pieces"]').type('kg')
      cy.get('input[placeholder="e.g., 50"]').type('10')
      cy.contains('button', 'Add Ingredient').click()
    })

    cy.contains(name, { timeout: 10000 }).should('be.visible')
  })

  it('opens edit modal for an ingredient', () => {
    cy.get('table tbody tr').first().within(() => {
      cy.contains('button', 'Edit').click()
    })
    cy.get('.fixed.inset-0').should('be.visible')
    cy.contains('button', 'Cancel').click()
  })

  it('archives an ingredient and it disappears from active list', () => {
    const name = `Archive Test ${Date.now()}`
    cy.contains('button', 'Add Ingredient').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[placeholder="e.g., Flour, Sugar, Eggs"]').type(name)
      cy.get('input[placeholder="e.g., kg, liters, pieces"]').type('pcs')
      cy.get('input[placeholder="e.g., 50"]').type('5')
      cy.contains('button', 'Add Ingredient').click()
    })
    cy.contains(name, { timeout: 10000 }).should('be.visible')

    cy.contains(name).parents('tr').first().within(() => {
      cy.contains('button', 'Archive').click()
    })

    cy.contains(name).should('not.exist')
  })

  it('shows archived ingredients in archived view', () => {
    cy.contains('button', 'Archived').click()
    cy.contains(/Archived/i).should('be.visible')
  })

  it('search filters ingredients by name', () => {
    cy.get('input[placeholder="Search ingredients..."]').should('be.visible')
      .type('sugar')
    cy.wait(500)
    cy.get('table tbody tr').each($row => {
      cy.wrap($row).invoke('text').then(text => {
        expect(text.toLowerCase()).to.include('sugar')
      })
    })
  })
})