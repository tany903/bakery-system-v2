/// <reference types="cypress" />

Cypress.Commands.add('login', (email: string, password: string, expectedPath: string) => {
  cy.session(
    email,
    () => {
      cy.visit('/login')
      cy.get('input[type="email"]').type(email)
      cy.get('input[type="password"]').should('not.be.disabled').type(password)
      cy.contains('button', 'Log In').click()
      cy.url({ timeout: 10000 }).should('include', expectedPath)
    },
    {
      cacheAcrossSpecs: true,
      validate() {
        // session is valid if we can reach a protected page without being redirected
        cy.visit(expectedPath)
        cy.url().should('include', expectedPath)
      },
    }
  )
  cy.visit(expectedPath)
})

Cypress.Commands.add('loginAsCashier', () => {
  cy.login(Cypress.env('CASHIER_EMAIL'), Cypress.env('CASHIER_PASSWORD'), '/pos')
})

Cypress.Commands.add('loginAsManager', () => {
  cy.login(Cypress.env('MANAGER_EMAIL'), Cypress.env('MANAGER_PASSWORD'), '/dashboard')
})

Cypress.Commands.add('loginAsProduction', () => {
  cy.login(Cypress.env('PRODUCTION_EMAIL'), Cypress.env('PRODUCTION_PASSWORD'), '/production')
})

declare global {
  namespace Cypress {
    interface Chainable {
      login(email: string, password: string, expectedPath: string): Chainable<void>
      loginAsCashier(): Chainable<void>
      loginAsManager(): Chainable<void>
      loginAsProduction(): Chainable<void>
    }
  }
}

export {}