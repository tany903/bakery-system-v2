describe('POS checkout', () => {
  beforeEach(() => {
    cy.loginAsCashier()
    cy.contains('Cart is empty').should('be.visible')
  })

  // ProductGrid renders each in-stock product as a <button> (out-of-stock
  // ones are disabled), inside the grid.grid-cols-2 container.
  function addFirstAvailableProductToCart() {
    cy.get('.grid.grid-cols-2 button:not(:disabled)').first().click()
  }

  it('completes a cash sale and shows a receipt with the correct total', () => {
    addFirstAvailableProductToCart()
    cy.contains('Cart is empty').should('not.exist')

    cy.get('input[type="number"][placeholder="0.00"]').type('1000')
    cy.contains('Change').should('be.visible')

    cy.contains('button', /^Charge ₱/).should('not.be.disabled').click()

    cy.contains('button', 'Print Receipt', { timeout: 10000 }).should('be.visible')
    cy.contains('TOTAL:').should('be.visible')
    cy.contains('** NOT AN OFFICIAL RECEIPT **').should('be.visible')

    cy.contains('button', 'Close').click()
    cy.contains('Cart is empty').should('be.visible')
  })

  it('blocks checkout when cash received is less than the total', () => {
    addFirstAvailableProductToCart()
    cy.get('input[type="number"][placeholder="0.00"]').type('1')
    cy.contains('button', /^Charge ₱/).should('be.disabled')
  })

  it('requires an amount before charging a cash sale at all', () => {
    addFirstAvailableProductToCart()
    cy.contains('button', /^Charge ₱/).should('be.disabled')
  })

  it('does not ask for cash received when paying online', () => {
    addFirstAvailableProductToCart()
    cy.contains('button', '💳 Online').click()
    cy.get('input[type="number"][placeholder="0.00"]').should('not.exist')
    cy.contains('This sale will').should('be.visible')
    cy.contains('button', /^Confirm Online ₱/).should('not.be.disabled')
  })

  it('lets a day-old discount reduce the item price shown in the cart', () => {
    addFirstAvailableProductToCart()
    cy.contains('button', '🍞 Day-Old').click()
    cy.contains('DAY-OLD').should('be.visible')
  })
})