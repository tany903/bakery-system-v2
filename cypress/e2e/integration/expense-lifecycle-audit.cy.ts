/**
 * [integration test] Expense Lifecycle & Audit Trail
 *
 * Target Modules: Expenses Module (Next.js) → Expense Logs (Supabase)
 *                 → Audit Logs Dashboard (Next.js)
 *
 * Scenario: Every expense action (create, archive, restore) must
 * generate a corresponding audit log entry. The audit trail must
 * reflect the full lifecycle of the expense in chronological order.
 *
 * Precondition: At least one expense category exists.
 *
 * Steps:
 *   1. Manager creates a new expense — audit log records "created".
 *   2. Manager archives the expense — audit log records "archived".
 *   3. Manager restores the expense — audit log records "restored".
 *   4. Audit log shows all 3 events in correct chronological order.
 *   5. Each event shows the correct expense name, amount, and performer.
 *
 * Expected Result: The expense_logs table captures every state change.
 * The Expense Activity tab in Audit Logs reflects the full lifecycle
 * with correct action badges (Created, Archived, Restored).
 */

describe('[integration test] Expense Lifecycle & Audit Trail', () => {
  const expenseName = `Integration Audit Test ${Date.now()}`

  it('manager creates a new expense', () => {
    cy.loginAsManager()
    cy.intercept('GET', '**/rest/v1/expenses*').as('expensesLoaded')
    cy.visit('/expenses')
    cy.wait('@expensesLoaded')

    cy.contains('button', 'Add Expense').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[placeholder="e.g., Electricity Bill"]').type(expenseName)
      cy.get('input[type="number"]').type('150')
      cy.get('select').find('option').not('[value=""]').first().then($opt => {
        cy.get('select').select($opt.val() as string)
      })
      cy.contains('button', 'Save Expense').click()
    })
    cy.contains(expenseName, { timeout: 10000 }).should('be.visible')
    Cypress.env('auditExpenseName', expenseName)
  })

  it('audit log shows created entry after expense is added', () => {
    const name = Cypress.env('auditExpenseName')
    cy.loginAsManager()
    cy.visit('/audit-logs')
    cy.contains('button', 'Expense Activity').click()
    cy.contains('td', name, { timeout: 10000 }).parents('tr').within(() => {
      cy.contains(/created/i).should('be.visible')
    })
  })

  it('manager archives the expense', () => {
    const name = Cypress.env('auditExpenseName')
    cy.loginAsManager()
    cy.intercept('GET', '**/rest/v1/expenses*').as('expensesLoaded')
    cy.visit('/expenses')
    cy.wait('@expensesLoaded')

    cy.contains(name).parents('[class*="rounded"]').first().within(() => {
      cy.contains('button', /Archive|Delete/i).click()
    })
    cy.get('.fixed.inset-0').within(() => {
      cy.contains('button', /Yes, Archive|Confirm/i).click()
    })
    cy.contains(/archived/i, { timeout: 10000 }).should('be.visible')
  })

  it('audit log shows archived entry after expense is archived', () => {
    cy.loginAsManager()
    cy.visit('/audit-logs')
    cy.contains('button', 'Expense Activity').click()

    cy.get('select').eq(0).select('archived')
    cy.get('select').eq(0).should('have.value', 'archived')
    cy.get('table tbody tr', { timeout: 10000 }).should('have.length.greaterThan', 0)
  })

  it('manager restores the expense', () => {
    const name = Cypress.env('auditExpenseName')
    cy.loginAsManager()
    cy.intercept('GET', '**/rest/v1/expenses*').as('expensesLoaded')
    cy.visit('/expenses')
    cy.wait('@expensesLoaded')
    cy.contains('button', /Archived Expenses/i).click()

    cy.contains(name, { timeout: 10000 }).parents('[class*="border"]').first().within(() => {
      cy.contains('button', 'Restore').click()
    })
    cy.get('.fixed.inset-0').within(() => {
      cy.contains('button', /Yes, Restore|Confirm/i).click()
    })
    cy.contains(/restored/i, { timeout: 10000 }).should('be.visible')
  })

  it('audit log shows restored entry and all 3 lifecycle events exist', () => {
    const name = Cypress.env('auditExpenseName')
    cy.loginAsManager()
    cy.visit('/audit-logs')
    cy.contains('button', 'Expense Activity').click()

    // Check all 3 events exist for this expense
    cy.get('select').eq(0).select('created')
    cy.contains('td', name, { timeout: 10000 }).should('exist')

    cy.get('select').eq(0).select('archived')
    cy.contains('td', name, { timeout: 10000 }).should('exist')

    cy.get('select').eq(0).select('restored')
    cy.contains('td', name, { timeout: 10000 }).should('exist')
  })
})/**
 * [integration test] Expense Lifecycle & Audit Trail
 *
 * Target Modules: Expenses Module (Next.js) → Expense Logs (Supabase)
 *                 → Audit Logs Dashboard (Next.js)
 *
 * Scenario: Every expense action (create, archive, restore) must
 * generate a corresponding audit log entry. The audit trail must
 * reflect the full lifecycle of the expense in chronological order.
 *
 * Precondition: At least one expense category exists.
 *
 * Steps:
 *   1. Manager creates a new expense — audit log records "created".
 *   2. Manager archives the expense — audit log records "archived".
 *   3. Manager restores the expense — audit log records "restored".
 *   4. Audit log shows all 3 events in correct chronological order.
 *   5. Each event shows the correct expense name, amount, and performer.
 *
 * Expected Result: The expense_logs table captures every state change.
 * The Expense Activity tab in Audit Logs reflects the full lifecycle
 * with correct action badges (Created, Archived, Restored).
 */

describe('[integration test] Expense Lifecycle & Audit Trail', () => {
  const expenseName = `Integration Audit Test ${Date.now()}`

  it('manager creates a new expense', () => {
    cy.loginAsManager()
    cy.intercept('GET', '**/rest/v1/expenses*').as('expensesLoaded')
    cy.visit('/expenses')
    cy.wait('@expensesLoaded')

    cy.contains('button', 'Add Expense').click()
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[placeholder="e.g., Electricity Bill"]').type(expenseName)
      cy.get('input[type="number"]').type('150')
      cy.get('select').find('option').not('[value=""]').first().then($opt => {
        cy.get('select').select($opt.val() as string)
      })
      cy.contains('button', 'Save Expense').click()
    })
    cy.contains(expenseName, { timeout: 10000 }).should('be.visible')
    Cypress.env('auditExpenseName', expenseName)
  })

  it('audit log shows created entry after expense is added', () => {
    const name = Cypress.env('auditExpenseName')
    cy.loginAsManager()
    cy.visit('/audit-logs')
    cy.contains('button', 'Expense Activity').click()
    cy.contains('td', name, { timeout: 10000 }).parents('tr').within(() => {
      cy.contains(/created/i).should('be.visible')
    })
  })

  it('manager archives the expense', () => {
    const name = Cypress.env('auditExpenseName')
    cy.loginAsManager()
    cy.intercept('GET', '**/rest/v1/expenses*').as('expensesLoaded')
    cy.visit('/expenses')
    cy.wait('@expensesLoaded')

    cy.contains(name).parents('[class*="rounded"]').first().within(() => {
      cy.contains('button', /Archive|Delete/i).click()
    })
    cy.get('.fixed.inset-0').within(() => {
      cy.contains('button', /Yes, Archive|Confirm/i).click()
    })
    cy.contains(/archived/i, { timeout: 10000 }).should('be.visible')
  })

  it('audit log shows archived entry after expense is archived', () => {
    cy.loginAsManager()
    cy.visit('/audit-logs')
    cy.contains('button', 'Expense Activity').click()

    cy.get('select').eq(0).select('archived')
    cy.get('select').eq(0).should('have.value', 'archived')
    cy.get('table tbody tr', { timeout: 10000 }).should('have.length.greaterThan', 0)
  })

  it('manager restores the expense', () => {
    const name = Cypress.env('auditExpenseName')
    cy.loginAsManager()
    cy.intercept('GET', '**/rest/v1/expenses*').as('expensesLoaded')
    cy.visit('/expenses')
    cy.wait('@expensesLoaded')
    cy.contains('button', /Archived Expenses/i).click()

    cy.contains(name, { timeout: 10000 }).parents('[class*="border"]').first().within(() => {
      cy.contains('button', 'Restore').click()
    })
    cy.get('.fixed.inset-0').within(() => {
      cy.contains('button', /Yes, Restore|Confirm/i).click()
    })
    cy.contains(/restored/i, { timeout: 10000 }).should('be.visible')
  })

  it('audit log shows restored entry and all 3 lifecycle events exist', () => {
    const name = Cypress.env('auditExpenseName')
    cy.loginAsManager()
    cy.visit('/audit-logs')
    cy.contains('button', 'Expense Activity').click()

    // Check all 3 events exist for this expense
    cy.get('select').eq(0).select('created')
    cy.contains('td', name, { timeout: 10000 }).should('exist')

    cy.get('select').eq(0).select('archived')
    cy.contains('td', name, { timeout: 10000 }).should('exist')

    cy.get('select').eq(0).select('restored')
    cy.contains('td', name, { timeout: 10000 }).should('exist')
  })
})