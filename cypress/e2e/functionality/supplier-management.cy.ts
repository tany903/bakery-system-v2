describe('[functionality test] Supplier Management', () => {
  /**
   * Target Feature: Supplier CRUD on /purchase-orders → Suppliers tab
   * Verifies: add, edit, archive a supplier (manager only)
   */

  beforeEach(() => {
    cy.loginAsManager()
    cy.visit('/purchase-orders')
    cy.contains('button', 'Suppliers').click()
  })

  it('opens the add supplier modal with correct fields', () => {
    cy.contains('button', '+ Supplier').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.contains('Add Supplier').should('be.visible')
      cy.get('input[placeholder="e.g., ABC Flour Supply"]').should('be.visible')
      cy.get('input[placeholder="09xx-xxx-xxxx"]').should('be.visible')
      cy.get('input[placeholder="supplier@email.com"]').should('be.visible')
      cy.contains('button', 'Save Supplier').should('be.visible')
    })
  })

  it('adds a new supplier and it appears in the suppliers list', () => {
    const name = `Cypress Supplier ${Date.now()}`
    cy.contains('button', '+ Supplier').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[placeholder="e.g., ABC Flour Supply"]').type(name)
      cy.get('input[placeholder="09xx-xxx-xxxx"]').type('0917-123-4567')
      cy.contains('button', 'Save Supplier').click()
    })
    cy.contains(name, { timeout: 10000 }).should('be.visible')
  })

  it('requires a supplier name before saving', () => {
    cy.contains('button', '+ Supplier').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[placeholder="09xx-xxx-xxxx"]').type('0917-000-0000')
      cy.contains('button', 'Save Supplier').click()
    })
    cy.contains('Add Supplier').should('be.visible')
  })

  it('edits a supplier and the update persists', () => {
    const originalName = `Edit Supplier ${Date.now()}`
    const updatedName = `Updated Supplier ${Date.now()}`

    cy.contains('button', '+ Supplier').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[placeholder="e.g., ABC Flour Supply"]').type(originalName)
      cy.contains('button', 'Save Supplier').click()
    })
    cy.contains(originalName, { timeout: 10000 }).should('be.visible')

    cy.contains(originalName).parents('.bg-white').first().within(() => {
      cy.contains('button', 'Edit').click()
    })
    cy.get('.fixed.inset-0').within(() => {
      cy.contains('Edit Supplier').should('be.visible')
      cy.get('input[type="text"]').first().clear().type(updatedName)
      cy.contains('button', 'Save Changes').click()
    })

    cy.contains(originalName).should('not.exist')
    cy.contains(updatedName, { timeout: 10000 }).should('be.visible')
  })

  it('archives a supplier and it disappears from the list', () => {
    const name = `Archive Supplier ${Date.now()}`
    cy.contains('button', '+ Supplier').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[placeholder="e.g., ABC Flour Supply"]').type(name)
      cy.contains('button', 'Save Supplier').click()
    })
    cy.contains(name, { timeout: 10000 }).should('be.visible')

    cy.contains(name).parents('.bg-white').first().within(() => {
      cy.contains('button', 'Archive').click()
    })
    cy.contains(name).should('not.exist')
  })

  it('shows Active/Archived toggle, defaulting to Active', () => {
    cy.contains('button', 'Active').should('be.visible')
    cy.contains('button', /Archived \(\d+\)/).should('be.visible')
  })

  it('restores an archived supplier back to the Active list', () => {
    const name = `Restore Supplier ${Date.now()}`
    cy.contains('button', '+ Supplier').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[placeholder="e.g., ABC Flour Supply"]').type(name)
      cy.contains('button', 'Save Supplier').click()
    })
    cy.contains(name, { timeout: 10000 }).should('be.visible')

    cy.contains(name).parents('.bg-white').first().within(() => {
      cy.contains('button', 'Archive').click()
    })
    cy.contains(name).should('not.exist')

    cy.contains('button', /Archived \(\d+\)/).click()
    cy.contains(name, { timeout: 10000 }).should('be.visible')

    cy.contains(name).parents('.bg-white').first().within(() => {
      cy.contains('button', 'Restore').click()
    })
    cy.contains(name).should('not.exist')

    cy.contains('button', 'Active').click()
    cy.contains(name, { timeout: 10000 }).should('be.visible')
  })
})