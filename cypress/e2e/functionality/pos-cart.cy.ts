describe('POS cart management', () => {
  beforeEach(() => {
    cy.loginAsCashier()
    cy.contains('Cart is empty').should('be.visible')
  })

  it('adds a product to the cart and shows item count', () => {
    cy.get('.grid.grid-cols-2 button:not(:disabled)').first().click()
    cy.contains('Cart is empty').should('not.exist')
    cy.contains('1 item').should('be.visible')
  })

  it('increments quantity when same product is added twice', () => {
    cy.get('.grid.grid-cols-2 button:not(:disabled)').first().click()
    cy.get('.grid.grid-cols-2 button:not(:disabled)').first().click()
    cy.contains('2 items').should('be.visible')
  })

  it('removes a product from cart using ✕ button', () => {
    cy.get('.grid.grid-cols-2 button:not(:disabled)').first().click()
    cy.contains('Cart is empty').should('not.exist')
    cy.contains('button', '✕').click()
    cy.contains('Cart is empty').should('be.visible')
  })

  it('clears entire cart with Clear Cart button', () => {
    cy.get('.grid.grid-cols-2 button:not(:disabled)').first().click()
    cy.get('.grid.grid-cols-2 button:not(:disabled)').eq(1).click()
    cy.contains('button', 'Clear Cart').click()
    cy.contains('Cart is empty').should('be.visible')
  })

  it('increases quantity with + button', () => {
    cy.get('.grid.grid-cols-2 button:not(:disabled)').first().click()
    cy.contains('1 item').should('be.visible')
    cy.contains('button', '+').click()
    cy.contains('2 items').should('be.visible')
  })

  it('decreases quantity with − button and removes at 0', () => {
    cy.get('.grid.grid-cols-2 button:not(:disabled)').first().click()
    cy.contains('button', '−').click()
    cy.contains('Cart is empty').should('be.visible')
  })

  it('shows total that updates when items are added', () => {
    cy.get('.grid.grid-cols-2 button:not(:disabled)').first().click()
    cy.contains('Total').should('be.visible')
    cy.contains(/₱\d/).should('be.visible')
  })

  it('searches products and filters results', () => {
  cy.get('.grid.grid-cols-2 button:not(:disabled)').first()
    .find('p').first()
    .invoke('text')
    .then(fullName => {
      const searchTerm = fullName.trim().split(/\s+/)[0]

      cy.get('input[placeholder="Search products..."]').type(searchTerm)
      cy.get('.grid.grid-cols-2 button').each($btn => {
        cy.wrap($btn).find('p').first().invoke('text').then(name => {
          expect(name.toLowerCase()).to.include(searchTerm.toLowerCase())
        })
      })
    })
})

  it('clears search and restores all products', () => {
    cy.get('.grid.grid-cols-2 button:not(:disabled)').its('length').as('initialCount')
    cy.get('input[placeholder="Search products..."]').type('zzzznotaproduct')
    cy.contains('No products found').should('be.visible')
    cy.get('input[placeholder="Search products..."]').clear()
    cy.get('@initialCount').then(count => {
      cy.get('.grid.grid-cols-2 button').should('have.length', count)
    })
  })
})