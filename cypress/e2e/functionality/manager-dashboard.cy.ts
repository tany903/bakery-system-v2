describe('Dashboard', () => {
  beforeEach(() => {
    cy.loginAsManager()
    cy.visit('/dashboard')
    cy.contains('Dashboard').should('be.visible')
  })

  it('shows today sales stat', () => {
    cy.contains("Today's Sales").should('be.visible')
  })

  it('shows cash on hand section', () => {
    cy.contains('Cash On Hand').should('be.visible')
    cy.contains(/₱/).should('be.visible')
  })

  it('shows low stock alert section', () => {
    cy.contains('Low Stock Alert').should('be.visible')
  })

  it('shows recent sales section', () => {
    cy.contains('Recent Sales').should('be.visible')
  })

  it('shows top selling products section', () => {
    cy.contains('Top Selling Products').should('be.visible')
  })

  it('shows today disposals section', () => {
    cy.contains("Today's Disposals").should('be.visible')
  })

  it('sidebar is visible and has nav links', () => {
    cy.contains('Dashboard').should('be.visible')
    cy.contains('Inventory').should('be.visible')
    cy.contains('Analytics').should('be.visible')
  })

  it('cash in button opens cash register', () => {
    cy.contains('button', '+ Cash In').click()
    cy.contains('Cash In').should('be.visible')
    cy.contains('button', 'Cancel').click()
  })

  it('cash out button opens cash register', () => {
    cy.contains('button', '- Cash Out').click()
    cy.contains('Cash Out').should('be.visible')
    cy.contains('button', 'Cancel').click()
  })
})