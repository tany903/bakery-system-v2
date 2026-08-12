describe('Product archive and restore', () => {
  beforeEach(() => {
    cy.loginAsManager()
    cy.visit('/products')
  })

  it('archives a product, hides it from the active list, then restores it', () => {
    cy.get('.grid.grid-cols-1').first().find('> div').first()
      .find('p, span').first().invoke('text').as('productName')

    cy.get('@productName').then(name => {
      cy.get('.grid.grid-cols-1').first().find('> div').first().within(() => {
        cy.contains('button', 'Archive').click()
      })

      cy.contains('button', 'Archived').click()
      cy.contains(name as unknown as string, { timeout: 10000 }).should('be.visible')
      cy.contains(name as unknown as string).parents('div').filter(':has(button:contains("Restore"))').first()
        .within(() => {
          cy.contains('button', 'Restore').click()
        })

      cy.contains('button', 'Active').click()
      cy.contains(name as unknown as string, { timeout: 10000 }).should('be.visible')
    })
  })

  it('archives a category, hides it from Active, then restores it', () => {
    cy.contains('button', 'Categories').click()

    cy.get('table tbody tr').first().find('td').first().invoke('text').as('categoryName')
    cy.get('@categoryName').then(name => {
      cy.get('table tbody tr').first().within(() => {
        cy.contains('button', 'Archive').click()
      })

      cy.contains('button', 'Archived').click()
      cy.contains(name as unknown as string, { timeout: 10000 }).should('be.visible')

      cy.get('table tbody tr').first().within(() => {
        cy.contains('button', 'Restore').click()
      })

      cy.contains('button', 'Active').click()
      cy.contains(name as unknown as string, { timeout: 10000 }).should('be.visible')
    })
  })
})