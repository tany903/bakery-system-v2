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

  // =========================
  // EXPENSE ACTIVITY
  // =========================

  it('shows expense activity tab', () => {
    cy.contains('button', 'Expense Activity').click()

    cy.contains('Expense Activity History').should('be.visible')
  })

  it('shows expense activity records', () => {
    cy.contains('button', 'Expense Activity').click()

    cy.get('table tbody tr', { timeout: 10000 })
      .should('have.length.greaterThan', 0)
  })

  it('shows expense activity table columns', () => {
    cy.contains('button', 'Expense Activity').click()

    cy.contains('Expense').should('be.visible')
    cy.contains('Amount').should('be.visible')
    cy.contains('Action').should('be.visible')
    cy.contains('By').should('be.visible')
  })

  it('can filter expense activity by action - created', () => {
    cy.contains('button', 'Expense Activity').click()

    cy.get('select').eq(0).select('created')
    cy.get('select').eq(0).should('have.value', 'created')

    cy.get('table tbody tr', { timeout: 10000 }).should('have.length.greaterThan', 0)
  })

  it('can filter expense activity by action - archived', () => {
    cy.contains('button', 'Expense Activity').click()

    cy.get('select').eq(0).select('archived')

    cy.get('select').eq(0)
      .should('have.value', 'archived')
  })

  it('can filter expense activity by action - restored', () => {
    cy.contains('button', 'Expense Activity').click()

    cy.get('select').eq(0).select('restored')

    cy.get('select').eq(0)
      .should('have.value', 'restored')
  })

  it('can filter expense activity by category', () => {
    cy.contains('button', 'Expense Activity').click()

    cy.get('select').eq(1)
      .find('option')
      .eq(1)
      .then(($option) => {
        const value = $option.val()

        if (value) {
          cy.get('select').eq(1).select(value as string)
        }
      })

    cy.get('select').eq(1).should('not.have.value', 'all')
  })

  it('can filter expense activity by date range', () => {
    cy.contains('button', 'Expense Activity').click()

    cy.get('input[type="date"]').eq(0).type('2026-01-01')
    cy.get('input[type="date"]').eq(1).type('2026-12-31')

    cy.get('input[type="date"]').eq(0).should('have.value', '2026-01-01')
    cy.get('input[type="date"]').eq(1).should('have.value', '2026-12-31')
  })

  it('expense activity shows correct action badge after creating an expense', () => {
    // Create an expense first to generate a log entry
    cy.visit('/expenses')
    cy.intercept('GET', '**/rest/v1/expenses*').as('expensesLoaded')
    cy.visit('/expenses')
    cy.wait('@expensesLoaded')

    const title = `Audit Test ${Date.now()}`
    cy.contains('button', 'Add Expense').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[placeholder="e.g., Electricity Bill"]').type(title)
      cy.get('input[type="number"]').type('99')
      cy.get('select').select(1)
      cy.contains('button', 'Save Expense').click()
    })
    cy.contains(title, { timeout: 10000 }).should('be.visible')

    // Check audit logs
    cy.visit('/audit-logs')
    cy.contains('button', 'Expense Activity').click()
    cy.contains('td', title, { timeout: 10000 }).parents('tr').within(() => {
      cy.contains(/created/i).should('be.visible')
    })
  })
})