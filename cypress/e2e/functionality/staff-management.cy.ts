describe('Staff management', () => {
  beforeEach(() => {
    cy.loginAsManager()
    cy.visit('/users')
    cy.contains(/Staff|Users/i).should('be.visible')
  })

  it('loads the staff page with user list', () => {
    cy.get('table tbody tr').should('have.length.greaterThan', 0)
  })

  it('shows user role badges', () => {
    cy.contains(/manager|cashier|production/i).should('be.visible')
  })

  it('shows add user button', () => {
    cy.contains('button', /Add Staff|New Staff|Create Staff/i).should('be.visible')
  })

  it('opens add user modal', () => {
    cy.contains('button', /Add Staff|New Staff|Create Staff/i).click()
    cy.get('.fixed.inset-0').should('be.visible')
    cy.contains('button', /Cancel|Close/).click()
  })

  it('add user form has required fields', () => {
    cy.contains('button', /Add Staff|New Staff|Create Staff/i).click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[type="email"]').should('be.visible')
      cy.get('input[type="password"]').should('be.visible')
      cy.get('select').should('be.visible')
    })
    cy.contains('button', /Cancel|Close/).click()
  })

  it('shows each user name and email', () => {
    cy.get('table tbody tr').first().within(() => {
      cy.contains(/@/).should('exist')
    })
  })
})