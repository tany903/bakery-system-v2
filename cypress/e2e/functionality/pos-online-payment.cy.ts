describe('POS online payment', () => {
  beforeEach(() => {
    cy.loginAsCashier()
    cy.contains('Cart is empty').should('be.visible')
    cy.get('.grid.grid-cols-2 button:not(:disabled)').first().click()
  })

  it('shows online payment info banner when online is selected', () => {
    cy.contains('button', '💳 Online').click()
    cy.contains('This sale will').should('be.visible')
    cy.contains('Cash on hand NOT affected').should('be.visible')
  })

  it('does not show cash received input for online payment', () => {
    cy.contains('button', '💳 Online').click()
    cy.get('input[type="number"][placeholder="0.00"]').should('not.exist')
  })

  it('confirm button is immediately enabled for online payment', () => {
    cy.contains('button', '💳 Online').click()
    cy.contains('button', /^Confirm Online ₱/).should('not.be.disabled')
  })

  it('completes an online sale and shows receipt', () => {
    cy.contains('button', '💳 Online').click()
    cy.contains('button', /^Confirm Online ₱/).click()
    cy.contains('button', 'Print Receipt', { timeout: 10000 }).should('be.visible')
    cy.contains('ONLINE', { matchCase: false }).should('be.visible')
    cy.contains('button', 'Close').click()
    cy.contains('Cart is empty').should('be.visible')
  })

  it('switching back to cash restores the cash input field', () => {
    cy.contains('button', '💳 Online').click()
    cy.get('input[type="number"][placeholder="0.00"]').should('not.exist')
    cy.contains('button', '💵 Cash').click()
    cy.get('input[type="number"][placeholder="0.00"]').should('be.visible')
  })
})