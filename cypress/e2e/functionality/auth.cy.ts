describe('Authentication', () => {
  it('redirects unauthenticated users to login', () => {
    cy.visit('/dashboard')
    cy.url().should('include', '/login')

    cy.visit('/pos')
    cy.url().should('include', '/login')

    cy.visit('/inventory')
    cy.url().should('include', '/login')
  })

  it('shows an error on wrong credentials', () => {
    cy.visit('/login')
    cy.get('input[type="email"]').type('wrong@example.com')
    cy.get('input[type="password"]').should('not.be.disabled').type('wrongpassword')
    cy.contains('button', 'Log In').click()
    cy.contains(/invalid|incorrect|error/i, { timeout: 8000 }).should('be.visible')
    cy.url().should('include', '/login')
  })

  it('logs in as cashier and redirects to /pos', () => {
    cy.loginAsCashier()
    cy.url().should('include', '/pos')
    cy.contains('Cart is empty').should('be.visible')
  })

  it('logs in as manager and redirects to /dashboard', () => {
    cy.loginAsManager()
    cy.url().should('include', '/dashboard')
    cy.contains('Dashboard').should('be.visible')
  })

  it('logs in as production and redirects to /production', () => {
    cy.loginAsProduction()
    cy.url().should('include', '/production')
  })

  it('logs out and redirects to login', () => {
    cy.loginAsCashier()
    cy.contains('button', 'Logout').click()
    cy.url().should('include', '/login')
  })

  it('blocks cashier from accessing /dashboard', () => {
    cy.loginAsCashier()
    cy.visit('/dashboard')
    // cashier should be redirected away from dashboard — either to /login or /pos
    cy.url().should('not.include', '/dashboard')
  })

  it('blocks production from accessing /dashboard', () => {
    cy.loginAsProduction()
    cy.visit('/dashboard')
    // production should be redirected away from dashboard — either to /login or /production
    cy.url().should('not.include', '/dashboard')
  })
})