describe('[functionality test] Purchase Order Reject & Cancel', () => {
  /**
   * Target Feature: PO lifecycle beyond approve/receive
   * Verifies: production can cancel a draft PO, manager can reject a
   * submitted PO with a reason, both show up under their status tabs
   */

  function fillMinimalPOForm() {
    // typed supplier name avoids depending on seeded supplier data
    cy.get('input[placeholder="e.g., ABC Supplies"]').type('Cypress Test Supplier')
    cy.get('select').eq(1).find('option').not('[value=""]').first().then($opt => {
      cy.get('select').eq(1).select($opt.val() as string)
    })
    cy.get('input[placeholder="0"]').type('5')
    cy.get('input[placeholder="0.00"]').type('20')
  }

  it('production can cancel a draft PO', () => {
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
      cy.contains('button', 'Cancel').first().click()
    })
    cy.contains('PO cancelled', { timeout: 10000 }).should('be.visible')
  })

  it('manager can reject a submitted PO with a reason', () => {
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
      cy.contains('button', 'Reject').first().click()
    })
    cy.get('.fixed.inset-0').within(() => {
      cy.contains('Reject PO').should('be.visible')
      cy.contains('button', 'Confirm Rejection').click()
    })
    cy.contains('Reject PO').should('be.visible')

    cy.get('textarea').type('Cypress rejection reason')
    cy.contains('button', 'Confirm Rejection').click()
    cy.get('.fixed.inset-0', { timeout: 10000 }).should('not.exist')
    cy.contains('PO rejected', { timeout: 10000 }).should('be.visible')

    cy.contains('button', 'Rejected').click()
    cy.contains('Cypress rejection reason', { timeout: 10000 }).should('be.visible')
  })
})