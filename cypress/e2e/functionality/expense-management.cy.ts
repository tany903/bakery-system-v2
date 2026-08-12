describe('Expenses', () => {
  beforeEach(() => {
    cy.loginAsManager()
    cy.visit('/expenses')
    // Wait for the page auth+data load to complete before any test runs
    // The expenses data fetch is the last thing that fires after currentUserId is set
    cy.intercept('GET', '**/rest/v1/expenses*').as('expensesLoaded')
    cy.visit('/expenses')
    cy.wait('@expensesLoaded')
    cy.contains('Add Expense').should('be.visible')
  })

  it('loads the expenses page', () => {
    cy.contains('Add Expense').should('be.visible')
  })

  it('opens the add expense modal with correct fields', () => {
    cy.contains('button', 'Add Expense').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[placeholder="e.g., Electricity Bill"]').should('be.visible')
      cy.get('input[type="number"]').should('be.visible')
      cy.get('input[type="date"]').should('be.visible')
      cy.contains('button', 'Save Expense').should('be.visible')
    })
  })

  it('adds a new expense and it appears in the list', () => {
    const title = `Cypress test expense ${Date.now()}`
    cy.contains('button', 'Add Expense').click()

    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[placeholder="e.g., Electricity Bill"]').type(title)
      cy.get('input[type="number"]').type('250.50')
      // select first available category
      cy.get('select').select(1)
      cy.contains('button', 'Save Expense').click()
    })

    cy.contains(title, { timeout: 10000 }).should('be.visible')
  })

  it('requires a title before saving an expense', () => {
    cy.contains('button', 'Add Expense').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[type="number"]').type('100')
      cy.contains('button', 'Save Expense').click()
    })
    cy.contains('Add Expense').should('be.visible')
  })

  it('filters expenses by month', () => {
    cy.get('select').first().should('be.visible')
  })

  it('edits an expense and the update persists', () => {
    // first, create a known expense so we have a stable target to edit
    const originalTitle = `Edit Target ${Date.now()}`
    const updatedTitle = `Updated Title ${Date.now()}`

    cy.contains('button', 'Add Expense').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[placeholder="e.g., Electricity Bill"]').type(originalTitle)
      cy.get('input[type="number"]').type('300')
      cy.get('select').select(1)
      cy.contains('button', 'Save Expense').click()
    })
    cy.contains(originalTitle, { timeout: 10000 }).should('be.visible')

    // open the edit modal from that expense's card
    cy.contains(originalTitle).parents('.bg-white').first().within(() => {
      cy.contains('button', 'Edit').click()
    })

    cy.get('.fixed.inset-0').within(() => {
      cy.contains('Edit Expense').should('be.visible')
      cy.get('input[type="text"]').first().clear().type(updatedTitle)
      cy.get('input[type="number"]').clear().type('475.25')
      cy.contains('button', 'Update Expense').click()
    })

    // old title gone, new title + updated amount visible
    cy.contains(originalTitle).should('not.exist')
    cy.contains(updatedTitle, { timeout: 10000 }).should('be.visible')
    cy.contains(updatedTitle).parents('.bg-white').first().within(() => {
      cy.contains('₱475.25').should('be.visible')
    })
  })

  it('deletes an expense', () => {
    const title = `Delete Target ${Date.now()}`

    cy.contains('button', 'Add Expense').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[placeholder="e.g., Electricity Bill"]').type(title)
      cy.get('input[type="number"]').type('150')
      cy.get('select').select(1)
      cy.contains('button', 'Save Expense').click()
    })
    cy.contains(title, { timeout: 10000 }).should('be.visible')

    cy.contains(title).parents('.bg-white').first().within(() => {
      cy.contains('button', 'Delete').click()
    })

    cy.get('.fixed.inset-0').within(() => {
      cy.contains('Delete Expense?').should('be.visible')
      cy.contains('button', 'Yes, Delete').click()
    })

    cy.contains(title).should('not.exist')
  })
})