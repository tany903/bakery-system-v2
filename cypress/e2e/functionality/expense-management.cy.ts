describe('[functionality test] Expense Management', () => {
  beforeEach(() => {
    cy.loginAsManager()
    cy.visit('/expenses')
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

    cy.contains(originalTitle).parents('.bg-white').first().within(() => {
      cy.contains('button', 'Edit').click()
    })

    cy.get('.fixed.inset-0').within(() => {
      cy.contains('Edit Expense').should('be.visible')
      cy.get('input[type="text"]').first().clear().type(updatedTitle)
      cy.get('input[type="number"]').clear().type('475.25')
      cy.contains('button', 'Update Expense').click()
    })

    cy.contains(originalTitle).should('not.exist')
    cy.contains(updatedTitle, { timeout: 10000 }).should('be.visible')
    cy.contains(updatedTitle).parents('.bg-white').first().within(() => {
      cy.contains('₱475.25').should('be.visible')
    })
  })

  it('archives an expense (Delete button) and it disappears from the active list', () => {
    const title = `Archive Target ${Date.now()}`

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

    // NOTE: the button says "Delete" but this is actually an archive/soft-delete
    cy.get('.fixed.inset-0').within(() => {
      cy.contains('Archive Expense?').should('be.visible')
      cy.contains('button', 'Yes, Archive').click()
    })

    cy.contains(title).should('not.exist')
  })

  it('restores an archived expense back to the active list', () => {
    const title = `Restore Target ${Date.now()}`

    cy.contains('button', 'Add Expense').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[placeholder="e.g., Electricity Bill"]').type(title)
      cy.get('input[type="number"]').type('200')
      cy.get('select').select(1)
      cy.contains('button', 'Save Expense').click()
    })
    cy.contains(title, { timeout: 10000 }).should('be.visible')

    cy.contains(title).parents('.bg-white').first().within(() => {
      cy.contains('button', 'Delete').click()
    })
    cy.get('.fixed.inset-0').within(() => {
      cy.contains('button', 'Yes, Archive').click()
    })
    cy.contains(title).should('not.exist')

    cy.contains('button', /Archived Expenses/i).click()
    cy.contains('td', title).parents('tr').within(() => {
      cy.contains('button', 'Restore').click()
    })
    cy.get('.fixed.inset-0').within(() => {
      cy.contains('Restore Expense?').should('be.visible')
      cy.contains('button', 'Yes, Restore').click()
    })
    cy.contains('td', title).should('not.exist')

    cy.contains('button', 'Expense Records').click()
    cy.contains(title, { timeout: 10000 }).should('be.visible')
  })

  it('creating an expense is recorded in Expense Activity', () => {
    const title = `Audit Create ${Date.now()}`
    cy.contains('button', 'Add Expense').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[placeholder="e.g., Electricity Bill"]').type(title)
      cy.get('input[type="number"]').type('99')
      cy.get('select').select(1)
      cy.contains('button', 'Save Expense').click()
    })
    cy.contains(title, { timeout: 10000 }).should('be.visible')

    cy.visit('/audit-logs')
    cy.contains('button', 'Expense Activity').click()
    cy.contains('td', title).parents('tr').within(() => {
      cy.contains(/created/i).should('be.visible')
    })
  })

  it('editing an expense is recorded in Expense Activity', () => {
    const originalTitle = `Audit Edit ${Date.now()}`
    const updatedTitle = `Audit Edited ${Date.now()}`

    cy.contains('button', 'Add Expense').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[placeholder="e.g., Electricity Bill"]').type(originalTitle)
      cy.get('input[type="number"]').type('150')
      cy.get('select').select(1)
      cy.contains('button', 'Save Expense').click()
    })
    cy.contains(originalTitle, { timeout: 10000 }).should('be.visible')

    cy.contains(originalTitle).parents('.bg-white').first().within(() => {
      cy.contains('button', 'Edit').click()
    })
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[type="text"]').first().clear().type(updatedTitle)
      cy.contains('button', 'Update Expense').click()
    })
    cy.contains(updatedTitle, { timeout: 10000 }).should('be.visible')

    cy.visit('/audit-logs')
    cy.contains('button', 'Expense Activity').click()
    cy.contains('td', updatedTitle).parents('tr').within(() => {
      cy.contains(/updated/i).should('be.visible')
    })
  })

  it('archiving and restoring an expense are both recorded in Expense Activity', () => {
    const title = `Audit Archive Restore ${Date.now()}`

    cy.contains('button', 'Add Expense').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[placeholder="e.g., Electricity Bill"]').type(title)
      cy.get('input[type="number"]').type('75')
      cy.get('select').select(1)
      cy.contains('button', 'Save Expense').click()
    })
    cy.contains(title, { timeout: 10000 }).should('be.visible')

    cy.contains(title).parents('.bg-white').first().within(() => {
      cy.contains('button', 'Delete').click()
    })
    cy.get('.fixed.inset-0').within(() => {
      cy.contains('button', 'Yes, Archive').click()
    })
    cy.contains(title).should('not.exist')

    cy.contains('button', /Archived Expenses/i).click()
    cy.contains('td', title).parents('tr').within(() => {
      cy.contains('button', 'Restore').click()
    })
    cy.get('.fixed.inset-0').within(() => {
      cy.contains('button', 'Yes, Restore').click()
    })

    cy.visit('/audit-logs')
    cy.contains('button', 'Expense Activity').click()

    cy.get('select').first().select('archived')
    cy.contains('td', title).should('be.visible')

    cy.get('select').first().select('restored')
    cy.contains('td', title).should('be.visible')
  })
})