describe('Audit logs', () => {

  beforeEach(() => {
    cy.loginAsManager()
    cy.visit('/audit-logs')

    cy.contains('Audit Logs', { timeout: 10000 })
      .should('be.visible')
  })

  // =========================
  // GENERAL
  // =========================

  it('loads the audit logs page', () => {
    cy.contains('Audit Logs').should('be.visible')
  })

  // =========================
  // INVENTORY TRANSACTIONS
  // =========================

  it('shows inventory transactions', () => {
    cy.contains('button', 'Inventory Transactions').click()

    cy.get('table tbody tr', { timeout: 10000 })
      .should('have.length.greaterThan', 0)
  })

  it('can filter inventory transactions by location', () => {
    cy.contains('button', 'Inventory Transactions').click()

    cy.get('select').eq(0).select('shop')

    cy.get('table tbody tr', { timeout: 10000 })
      .should('have.length.greaterThan', 0)
      .and('contain.text', 'shop')
  })

  it('can clear inventory filters', () => {
    cy.contains('button', 'Inventory Transactions').click()

    cy.get('select').eq(0).select('shop')

    cy.contains('button', 'Clear Filters').click()

    cy.get('select').eq(0)
      .should('have.value', 'all')
  })

  // =========================
  // ACCOUNT ACTIVITY
  // =========================

  it('shows account activity', () => {
    cy.contains('button', 'Account Activity').click()

    cy.get('table tbody tr', { timeout: 10000 })
      .should('have.length.greaterThan', 0)
  })

  it('can filter account activity by action', () => {
  cy.contains('button', 'Account Activity').click()

  cy.get('select').eq(0).select('login')

  cy.get('select').eq(0)
    .should('have.value', 'login')

  cy.get('table tbody tr', { timeout: 10000 })
    .should('have.length.greaterThan', 0)
})

  it('can filter account activity by user', () => {
    cy.contains('button', 'Account Activity').click()

    cy.get('select').eq(1)
      .find('option')
      .eq(1)
      .then(($option) => {
        const value = $option.val()

        if (value) {
          cy.get('select').eq(1).select(value)
        }
      })

    cy.get('table tbody tr', { timeout: 10000 })
      .should('have.length.greaterThan', 0)
  })

})