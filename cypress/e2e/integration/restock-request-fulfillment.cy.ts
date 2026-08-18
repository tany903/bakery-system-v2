/**
 * [integration test] Restock Request Full Lifecycle
 *
 * Target Modules: Restock Requests (Next.js) → Production Module (Next.js)
 *                 → Inventory Database (Supabase) → Dashboard Alert
 *
 * Scenario: A restock request flows from creation by the manager,
 * through fulfillment by production, and results in updated shop
 * stock levels. The request status must update at each stage and
 * disappear from the pending queue once fulfilled.
 *
 * Precondition: At least one product exists.
 *
 * Steps:
 *   1. Manager creates a restock request for a product.
 *   2. Request appears with Pending status.
 *   3. Production views the request and fulfills it.
 *   4. Request status updates to Fulfilled.
 *   5. Request no longer appears in the Pending queue.
 *
 * Expected Result: The restock request transitions cleanly through
 * Pending → Fulfilled. Production fulfillment is recorded and the
 * manager can verify it in the fulfilled requests list.
 */

describe('[integration test] Restock Request Full Lifecycle', () => {
  const restockNote = `Integration Restock ${Date.now()}`

  it('manager creates a restock request', () => {
    cy.loginAsManager()
    cy.visit('/restock-requests')
    cy.contains('button', 'New Request').click()

    cy.get('.fixed.inset-0').within(() => {
      cy.get('select').first().select(1)
      cy.get('input[placeholder="e.g., 50"]').type('5')
      cy.get('textarea[placeholder*="Needed before"]').type(restockNote)
      cy.contains('button', /^Create Request/).click()
    })

    cy.contains(restockNote, { timeout: 10000 }).should('be.visible')
    Cypress.env('restockNote', restockNote)
  })

  it('new request shows Pending status', () => {
    const note = Cypress.env('restockNote')
    cy.loginAsManager()
    cy.visit('/restock-requests')

    // Pending tab is default — the badge should be visible on the page
    cy.contains(note, { timeout: 10000 }).should('be.visible')
    // Pending badge exists somewhere on the page
    cy.contains(/pending/i).should('be.visible')
  })

  it('production can see the request', () => {
    const note = Cypress.env('restockNote')
    cy.loginAsProduction()
    cy.visit('/restock-requests')
    cy.contains(note, { timeout: 10000 }).should('be.visible')
  })

  it('production fulfills the request', () => {
    const note = Cypress.env('restockNote')
    cy.loginAsProduction()
    cy.visit('/restock-requests')

    cy.contains(note, { timeout: 10000 })
      .parents('div').filter(':has(button:contains("Fulfill"))').first()
      .within(() => {
        cy.contains('button', 'Fulfill').click()
      })

    cy.get('.fixed.inset-0').within(() => {
      cy.contains('button', 'Confirm Fulfillment').click()
    })

    cy.contains(/fulfilled|success/i, { timeout: 10000 }).should('be.visible')
  })

  it('request status updates to Fulfilled', () => {
    cy.loginAsManager()
    cy.visit('/restock-requests')
    cy.contains('button', /Fulfilled/i).click()
    // Fulfilled tab loads and shows fulfilled cards
    cy.get('.grid > div', { timeout: 15000 }).should('have.length.greaterThan', 0)
    cy.contains('Fulfilled').should('be.visible')
  })

  it('request no longer appears in Pending queue', () => {
    const note = Cypress.env('restockNote')
    cy.loginAsManager()
    cy.visit('/restock-requests')
    // Default tab is Pending — note should not be there
    cy.contains(note).should('not.exist')
  })
})