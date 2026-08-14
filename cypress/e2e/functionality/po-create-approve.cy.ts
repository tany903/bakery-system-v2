describe('[functionality test] Purchase Order Create & Accept', () => {

  function fillMinimalPOForm() {
    // typed supplier name avoids depending on seeded supplier data
    cy.get('input[placeholder="e.g., ABC Supplies"]').type('Cypress Test Supplier')
    cy.get('select').eq(1).find('option').not('[value=""]').first().then($opt => {
      cy.get('select').eq(1).select($opt.val() as string)
    })
    cy.get('input[placeholder="0"]').type('10')
    cy.get('input[placeholder="0.00"]').type('50')
  }

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
      fillMinimalPOForm()
      cy.contains('button', 'Create Purchase Order').click()
    })

    // the modal must actually close — cy.contains(/PO-/) alone can false-positive
    // by matching a pre-existing PO's number sitting behind the modal overlay
    cy.get('.fixed.inset-0', { timeout: 10000 }).should('not.exist')
    cy.contains(/PO-/, { timeout: 10000 }).should('be.visible')
  })

  it('creates a PO, submits it, and manager approves it', () => {
    cy.loginAsProduction()
    cy.visit('/purchase-orders')

    cy.contains('button', 'New PO').click()
    cy.get('.fixed.inset-0').within(() => {
      fillMinimalPOForm()
      cy.contains('button', 'Create Purchase Order').click()
    })
    cy.get('.fixed.inset-0', { timeout: 10000 }).should('not.exist')
    cy.contains(/PO-/, { timeout: 10000 }).should('be.visible')

    cy.contains('button', 'Draft').click()
    cy.get('.grid').eq(1).within(() => {
      cy.contains('button', 'Submit').first().click()
    })
    cy.contains('PO submitted for approval', { timeout: 10000 }).should('be.visible')

    cy.loginAsManager()
    cy.visit('/purchase-orders')
    cy.contains('button', 'Submitted').click()
    cy.get('.grid').eq(1).within(() => {
      cy.contains('button', 'Approve').first().click()
    })
    cy.contains('PO approved', { timeout: 10000 }).should('be.visible')

    cy.contains('button', 'Approved').click()
    cy.contains(/PO-/, { timeout: 10000 }).should('be.visible')
  })
})