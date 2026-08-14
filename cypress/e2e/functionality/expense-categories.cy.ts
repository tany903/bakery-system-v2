describe('[functionality test] Expense Categories', () => {
  beforeEach(() => {
    cy.loginAsManager()
    cy.visit('/expenses')
    cy.intercept('GET', '**/rest/v1/expenses*').as('expensesLoaded')
    cy.visit('/expenses')
    cy.wait('@expensesLoaded')
    cy.contains('button', 'Categories').click()
  })

  it('opens the add category modal with correct fields', () => {
    cy.contains('button', 'Add Category').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.contains('Add Category').should('be.visible')
      cy.get('input[type="text"]').eq(0).should('be.visible')  // Category Name
      cy.get('input[type="text"]').eq(1).should('be.visible')  // Description
      cy.contains('button', 'Add Category').should('be.visible')
    })
  })

  it('adds a new category and it appears in the categories list', () => {
    const name = `Cypress Category ${Date.now()}`
    cy.contains('button', 'Add Category').click()

    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[type="text"]').eq(0).type(name)
      cy.get('input[type="text"]').eq(1).type('Cypress test category')
      cy.contains('button', 'Add Category').click()
    })

    cy.contains(name, { timeout: 10000 }).should('be.visible')
  })

  it('requires a name before saving a category', () => {
    cy.contains('button', 'Add Category').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[type="text"]').eq(1).type('No name given')
      cy.contains('button', 'Add Category').click()
    })
    cy.contains('Add Category').should('be.visible')
  })

  it('shows record count and total spent per category', () => {
    cy.contains('.bg-white', 'Records').first().within(() => {
      cy.contains('Records').should('be.visible')
      cy.contains('Total Spent').should('be.visible')
    })
  })

  it('edits a category and the update persists', () => {
    const originalName = `Edit Cat ${Date.now()}`
    const updatedName = `Updated Cat ${Date.now()}`
    const updatedDesc = `Updated description ${Date.now()}`

    cy.contains('button', 'Add Category').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[type="text"]').eq(0).type(originalName)
      cy.contains('button', 'Add Category').click()
    })
    cy.contains(originalName, { timeout: 10000 }).should('be.visible')

    cy.contains(originalName).parents('.bg-white').first().within(() => {
      cy.contains('button', 'Edit').click()
    })

    cy.get('.fixed.inset-0').within(() => {
      cy.contains('Edit Category').should('be.visible')
      cy.get('input[type="text"]').eq(0).clear().type(updatedName)
      cy.get('input[type="text"]').eq(1).clear().type(updatedDesc)
      cy.contains('button', 'Update Category').click()
    })

    cy.contains(originalName).should('not.exist')
    cy.contains(updatedName, { timeout: 10000 }).should('be.visible')
    cy.contains(updatedName).parents('.bg-white').first().within(() => {
      cy.contains(updatedDesc).should('be.visible')
    })
  })

  it('archives a category and it disappears from the categories list', () => {
    const name = `Archive Cat ${Date.now()}`

    cy.contains('button', 'Add Category').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[type="text"]').eq(0).type(name)
      cy.contains('button', 'Add Category').click()
    })
    cy.contains(name, { timeout: 10000 }).should('be.visible')

    cy.contains(name).parents('.bg-white').first().within(() => {
      cy.contains('button', 'Archive').click()
    })
    cy.get('.fixed.inset-0').within(() => {
      cy.contains('Archive Category?').should('be.visible')
      cy.contains('button', 'Yes, Archive').click()
    })

    cy.contains(name).should('not.exist')
  })

  it('archived category no longer appears in the Add Expense category dropdown', () => {
    const name = `Dropdown Gone ${Date.now()}`

    cy.contains('button', 'Add Category').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[type="text"]').eq(0).type(name)
      cy.contains('button', 'Add Category').click()
    })
    cy.contains(name, { timeout: 10000 }).should('be.visible')

    cy.contains(name).parents('.bg-white').first().within(() => {
      cy.contains('button', 'Archive').click()
    })
    cy.get('.fixed.inset-0').within(() => {
      cy.contains('button', 'Yes, Archive').click()
    })
    cy.contains(name).should('not.exist')

    cy.contains('button', 'Expense Records').click()
    cy.contains('button', 'Add Expense').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('select').find('option').each($opt => {
        expect($opt.text()).not.to.eq(name)
      })
    })
  })

  it('archived category is preserved on existing expenses (not removed retroactively)', () => {
    const name = `Preserve Cat ${Date.now()}`
    const expenseTitle = `Expense with archived cat ${Date.now()}`

    cy.contains('button', 'Add Category').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[type="text"]').eq(0).type(name)
      cy.contains('button', 'Add Category').click()
    })
    cy.contains(name, { timeout: 10000 }).should('be.visible')

    cy.contains('button', 'Expense Records').click()
    cy.contains('button', 'Add Expense').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[placeholder="e.g., Electricity Bill"]').type(expenseTitle)
      cy.get('input[type="number"]').type('50')
      cy.get('select').select(name)
      cy.contains('button', 'Save Expense').click()
    })
    cy.contains(expenseTitle, { timeout: 10000 }).should('be.visible')

    cy.contains('button', 'Categories').click()
    // scoped to the active-categories grid container (rather than searching the
    // whole page) since the "Expenses by Category" summary panel above the tabs
    // also matches the category name once an expense exists under it
    cy.get('[data-cy="active-categories-grid"]').contains(name).parents('.overflow-hidden').first().within(() => {
      cy.contains('button', 'Archive').click()
    })
    cy.get('.fixed.inset-0').within(() => {
      cy.contains('button', 'Yes, Archive').click()
    })

    cy.contains('button', 'Expense Records').click()
    cy.contains(expenseTitle).parents('.bg-white').first().within(() => {
      cy.contains(name).should('be.visible')
    })
  })

  it('archives a category, then restores it from the Archived sub-tab', () => {
  const name = `Restore Cat ${Date.now()}`

  cy.contains('button', 'Add Category').click()
  cy.get('.fixed.inset-0').within(() => {
    cy.get('input[type="text"]').eq(0).type(name)
    cy.contains('button', 'Add Category').click()
  })
  cy.contains(name, { timeout: 10000 }).should('be.visible')

  cy.get('[data-cy="active-categories-grid"]').contains(name).parents('.overflow-hidden').first().within(() => {
    cy.contains('button', 'Archive').click()
  })
  cy.get('.fixed.inset-0').within(() => {
    cy.contains('button', 'Yes, Archive').click()
  })
  cy.get('[data-cy="active-categories-grid"]').should('not.contain', name)

  cy.contains('button', /Archived \(\d+\)/).click()
  cy.contains(name, { timeout: 10000 }).should('be.visible')
  cy.contains(name).parents('.overflow-hidden').first().within(() => {
    cy.contains('button', 'Restore').click()
  })

  cy.contains(name).should('not.exist')

  cy.contains('button', 'Active').click()
  cy.contains(name, { timeout: 10000 }).should('be.visible')
})
})