describe('[functionality test] Product Categories', () => {

  beforeEach(() => {
    cy.loginAsManager()
    cy.visit('/products')
    cy.contains('button', 'Categories').click()
  })

  it('switches to categories tab and shows the category table', () => {
    cy.contains(/All Categories/i).should('be.visible')
    cy.contains('th', 'Name').should('be.visible')
    cy.contains('th', 'Products').should('be.visible')
  })

  it('opens the add category modal with correct fields', () => {
    cy.contains('button', 'Add Category').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.contains('Add Category').should('be.visible')
      cy.get('input[type="text"]').should('be.visible')
      cy.get('textarea').should('be.visible')
      cy.contains('button', 'Create Category').should('be.visible')
    })
  })

  it('adds a new category and it appears in the categories table', () => {
    const name = `Cypress Category ${Date.now()}`
    cy.contains('button', 'Add Category').click()

    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[type="text"]').type(name)
      cy.get('textarea').type('Cypress test category')
      cy.contains('button', 'Create Category').click()
    })

    cy.contains('td', name, { timeout: 10000 }).should('be.visible')
  })

  it('edits a category and the update persists', () => {
    const originalName = `Edit Cat ${Date.now()}`
    const updatedName = `Updated Cat ${Date.now()}`

    cy.contains('button', 'Add Category').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[type="text"]').type(originalName)
      cy.contains('button', 'Create Category').click()
    })
    cy.contains('td', originalName, { timeout: 10000 }).should('be.visible')

    cy.contains('td', originalName).parents('tr').within(() => {
      cy.contains('button', 'Edit').click()
    })

    cy.get('.fixed.inset-0').within(() => {
      cy.contains('Edit Category').should('be.visible')
      cy.get('input[type="text"]').clear().type(updatedName)
      cy.contains('button', 'Update Category').click()
    })

    cy.contains('td', originalName).should('not.exist')
    cy.contains('td', updatedName, { timeout: 10000 }).should('be.visible')
  })

  it('shows product count per category', () => {
    cy.contains('td', /\d+ products/).should('be.visible')
  })

  it('archives a category and it disappears from the active table', () => {
    const name = `Archive Cat ${Date.now()}`

    cy.contains('button', 'Add Category').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[type="text"]').type(name)
      cy.contains('button', 'Create Category').click()
    })
    cy.contains('td', name, { timeout: 10000 }).should('be.visible')

    cy.contains('td', name).parents('tr').within(() => {
      cy.contains('button', 'Archive').click()
    })

    cy.contains('td', name).should('not.exist')
  })

  it('restores an archived category back to active', () => {
    const name = `Restore Cat ${Date.now()}`

    cy.contains('button', 'Add Category').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[type="text"]').type(name)
      cy.contains('button', 'Create Category').click()
    })
    cy.contains('td', name, { timeout: 10000 }).should('be.visible')

    cy.contains('td', name).parents('tr').within(() => {
      cy.contains('button', 'Archive').click()
    })
    cy.contains('td', name).should('not.exist')

    cy.contains('button', 'Archived').click()
    cy.contains('td', name, { timeout: 10000 }).should('be.visible')

    cy.contains('td', name).parents('tr').within(() => {
      cy.contains('button', 'Restore').click()
    })
    cy.contains('td', name).should('not.exist')

    cy.contains('button', 'Active').click()
    cy.contains('td', name, { timeout: 10000 }).should('be.visible')
  })

})