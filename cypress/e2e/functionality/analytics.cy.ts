describe('Analytics', () => {
  beforeEach(() => {
    cy.loginAsManager()
    cy.visit('/analytics')
    cy.contains('Analytics').should('be.visible')
  })

  it('loads the analytics page', () => {
    cy.contains('Analytics').should('be.visible')
  })

  it('shows revenue stat', () => {
    cy.contains(/Revenue|Sales/i).should('be.visible')
    cy.contains(/₱/).should('be.visible')
  })

  it('shows a chart or graph section', () => {
    cy.get('svg, canvas, .recharts-wrapper').should('exist')
  })

  it('has a date range filter', () => {
    cy.get('input[type="date"]').should('have.length.greaterThan', 0)
  })

  it('shows top products section', () => {
    cy.contains(/Top|Best/i).should('be.visible')
  })

  it('changing date range updates the view', () => {
    cy.get('input[type="date"]').first().type('2026-01-01')
    cy.get('input[type="date"]').last().type('2026-12-31')
    cy.contains(/Revenue|Sales|₱/i).should('be.visible')
  })

  it('shows expense breakdown', () => {
    cy.contains(/Expense|Cost/i).should('be.visible')
  })
})