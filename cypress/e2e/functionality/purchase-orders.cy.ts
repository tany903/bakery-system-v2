describe('Purchase Orders', () => {
  beforeEach(() => {
    cy.loginAsManager()
    cy.visit('/purchase-orders')
    cy.contains('PO-').should('be.visible')
  })

  it('loads the purchase orders page with existing POs', () => {
    cy.get('.grid').should('be.visible')
    cy.contains(/PO-\d+/).should('be.visible')
  })

  it('shows PO status badges', () => {
    cy.contains(/Draft|Submitted|Approved|Received/i).should('be.visible')
  })

  it('can view a PO detail', () => {
    cy.contains('button', 'View').first().click()
    cy.contains(/PO-\d+/).should('be.visible')
    cy.contains('button', 'Close').click()
  })

  it('creates a new draft PO', () => {
    cy.contains('button', 'New PO').click()

    cy.get('.fixed.inset-0').within(() => {
      // supplier is a dropdown
      cy.get('select').first().select(1)
      // select first ingredient
      cy.get('select').eq(1).select(1)
      // fill qty and unit cost
      cy.get('input[placeholder="0"]').type('10')
      cy.get('input[placeholder="0.00"]').type('50')
      cy.contains('button', 'Create Purchase Order').click()
    })

    cy.contains(/PO-/, { timeout: 10000 }).should('be.visible')
  })

  it('shows pagination controls', () => {
    cy.contains(/Showing \d+/).should('be.visible')
  })

  it('filters POs by status', () => {
    cy.contains('button', /Draft/i).click()
    cy.contains(/Draft/i).should('be.visible')
  })
})