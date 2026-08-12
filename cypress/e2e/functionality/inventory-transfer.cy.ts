describe('Inventory management', () => {
  beforeEach(() => {
    cy.loginAsManager()
    cy.visit('/inventory')
  })

  it('loads the inventory page with products listed', () => {
    cy.contains('Inventory').should('be.visible')
    cy.get('table tbody tr').should('have.length.greaterThan', 0)
  })

  it('transfers stock from production to shop', () => {
  // Not every product has production stock available to transfer — the
  // Transfer button only renders when production_current_stock > 0. Find a
  // row that actually has one instead of assuming the first row does.
  cy.get('table tbody tr:has(button:contains("Transfer"))').first().within(() => {
    cy.contains('button', 'Transfer').click()
  })

  cy.get('.fixed.inset-0').within(() => {
    cy.contains('Transfer Stock').should('be.visible')
    cy.get('input[type="number"]').clear().type('1')
    cy.contains('button', 'Confirm Transfer').click()
  })

  cy.contains(/transferred|success/i, { timeout: 10000 }).should('be.visible')
})

  it('shows low stock products in low stock alert on dashboard', () => {
    cy.visit('/dashboard')
    cy.contains('Low Stock Alert').should('be.visible')
  })

  it('search input is visible and enabled', () => {
    cy.get('input[placeholder*="Search"]').first()
      .should('be.visible')
      .and('not.be.disabled')
  })

  it('shows both shop and production stock columns', () => {
    cy.contains('Shop Stock').should('be.visible')
    cy.contains('Production Stock').should('be.visible')
  })
})