describe('[functionality test] Root Redirect & Role-Based Access Guards', () => {
  /**
   * Target Feature: Root route redirect + per-role page protection
   * Verifies: '/' redirects unauthenticated users to /login,
   * each role is blocked from pages reserved for other roles,
   * and pages with no role restriction stay open to everyone
   */

  it('redirects "/" to /login when logged out', () => {
    cy.visit('/')
    cy.url().should('include', '/login')
  })

  it('cashier is blocked from manager-only pages', () => {
    cy.loginAsCashier()
    const managerOnlyPages = ['/products', '/users', '/transactions', '/analytics', '/expenses', '/cash-register-log', '/audit-logs']
    managerOnlyPages.forEach(path => {
      cy.visit(path)
      cy.url().should('not.include', path)
    })
  })

  it('production is blocked from manager-only pages', () => {
    cy.loginAsProduction()
    const managerOnlyPages = ['/products', '/users', '/transactions', '/analytics', '/expenses', '/cash-register-log', '/audit-logs']
    managerOnlyPages.forEach(path => {
      cy.visit(path)
      cy.url().should('not.include', path)
    })
  })

  it('cashier is blocked from production, purchase orders, and ingredients', () => {
    cy.loginAsCashier()
    cy.visit('/production')
    cy.url().should('not.include', '/production')

    cy.visit('/purchase-orders')
    cy.url().should('not.include', '/purchase-orders')

    cy.visit('/ingredients')
    cy.url().should('not.include', '/ingredients')
  })

  it('production is blocked from POS', () => {
    cy.loginAsProduction()
    cy.visit('/pos')
    cy.url().should('not.include', '/pos')
  })

  it('restock-requests and reservations stay open to every role', () => {
    cy.loginAsCashier()
    cy.visit('/restock-requests')
    cy.url().should('include', '/restock-requests')

    cy.loginAsProduction()
    cy.visit('/reservations')
    cy.url().should('include', '/reservations')

    cy.loginAsManager()
    cy.visit('/restock-requests')
    cy.url().should('include', '/restock-requests')
  })
})