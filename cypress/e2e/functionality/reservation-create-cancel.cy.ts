describe('[functionality test] Advance Order / Reservation Creation', () => {
  beforeEach(() => {
    cy.loginAsCashier()
    cy.contains('button', 'Advance Order').click()
    cy.contains('Reserve products with a 50% deposit').should('be.visible')
  })

  it('requires a customer name before submitting', () => {
    cy.get('input[placeholder="e.g., Maria Santos"]').type(' ')
    cy.get('select').first().select(1)
    cy.get('input[placeholder="Quantity"]').type('2')
    cy.contains('button', 'Confirm Reservation & Collect Fee').click()
    cy.contains('Customer name is required').should('be.visible')
  })

  function extractPeso(text: string): number {
    const match = text.match(/₱([\d,]+\.\d{2})/)
    return match ? parseFloat(match[1].replace(/,/g, '')) : NaN
  }

  it('computes a 50% fee and remaining balance from the order total', () => {
    cy.get('input[placeholder="e.g., Maria Santos"]').type('Test Customer')
    cy.get('select').first().select(1)
    cy.get('input[placeholder="Quantity"]').type('3')

    cy.contains('Total Order Value').parent().invoke('text').then(totalText => {
      const total = extractPeso(totalText)
      cy.contains('Fee to Collect Now (50%)').parent().invoke('text').then(feeText => {
        const fee = extractPeso(feeText)
        expect(fee).to.be.closeTo(total / 2, 0.01)
      })
    })
  })

  it('creates the reservation and shows the fee/balance confirmation', () => {
    cy.get('input[placeholder="e.g., Maria Santos"]').type('Test Customer')
    cy.get('input[placeholder="09xx-xxx-xxxx"]').type('09171234567')
    cy.get('select').first().select(1)
    cy.get('input[placeholder="Quantity"]').type('1')

    cy.contains('button', 'Confirm Reservation & Collect Fee').click()

    cy.contains(/Reservation created — fee of ₱.+ collected, balance ₱.+ due at pickup/, { timeout: 10000 })
      .should('be.visible')
  })
})

describe('[functionality test] Reservation Cancellation', () => {
  /**
   * Target Feature: Reservation cancel flow on /reservations
   * Verifies: cancel requires a reason, cancelled reservations show up
   * under the Cancelled status tab with their reason visible
   *
   * Each test creates its own reservation first (via the Advance Order
   * modal on /pos), rather than assuming a pending/ready reservation
   * already exists in seed data — cancel depends on create, so we make
   * that dependency explicit and self-contained per test.
   */

  function createReservation(customerName: string) {
    cy.visit('/pos')
    cy.contains('button', 'Advance Order').click()
    cy.get('input[placeholder="e.g., Maria Santos"]').type(customerName)
    cy.get('select').first().select(1)
    cy.get('input[placeholder="Quantity"]').type('1')
    cy.contains('button', 'Confirm Reservation & Collect Fee').click()
    cy.contains(/Reservation created/, { timeout: 10000 }).should('be.visible')
  }

  beforeEach(() => {
    cy.loginAsCashier()
  })

  it('shows a Cancel button on a freshly created reservation', () => {
    const name = `Cancel Btn Test ${Date.now()}`
    createReservation(name)

    cy.visit('/reservations')
    cy.contains(name, { timeout: 10000 }).should('be.visible')
    cy.contains(name).parents('div').filter(':has(button:contains("Cancel"))').first()
      .within(() => {
        cy.contains('button', 'Cancel').should('be.visible')
      })
  })

  it('cancel requires a reason before confirming', () => {
    const name = `No Reason Test ${Date.now()}`
    createReservation(name)

    cy.visit('/reservations')
    cy.contains(name, { timeout: 10000 }).should('be.visible')
    cy.contains(name).parents('div').filter(':has(button:contains("Cancel"))').first()
      .within(() => {
        cy.contains('button', 'Cancel').click()
      })

    cy.get('.fixed.inset-0').within(() => {
      cy.contains('Cancel Reservation').should('be.visible')
      cy.contains('button', 'Confirm Cancellation').click()
    })
    // no reason entered — should stay open / show validation error, not disappear
    cy.contains('Cancel Reservation').should('be.visible')
  })

  it('cancelling a reservation with a reason moves it to the Cancelled tab', () => {
    const name = `Cancel Flow Test ${Date.now()}`
    createReservation(name)

    cy.visit('/reservations')
    cy.contains(name, { timeout: 10000 }).should('be.visible')
    cy.contains(name).parents('div').filter(':has(button:contains("Cancel"))').first()
      .within(() => {
        cy.contains('button', 'Cancel').click()
      })

    cy.get('.fixed.inset-0').within(() => {
      cy.get('textarea').type('Cypress test cancellation')
      cy.contains('button', 'Confirm Cancellation').click()
    })
    cy.contains('Reservation cancelled', { timeout: 10000 }).should('be.visible')

    cy.contains('button', /Cancelled/i).click()
    cy.contains(name, { timeout: 10000 }).should('be.visible')
  })

  it('cancelled reservation shows its cancellation reason', () => {
    const name = `Reason Visible Test ${Date.now()}`
    const reason = `Cypress reason ${Date.now()}`
    createReservation(name)

    cy.visit('/reservations')
    cy.contains(name, { timeout: 10000 }).should('be.visible')
    cy.contains(name).parents('div').filter(':has(button:contains("Cancel"))').first()
      .within(() => {
        cy.contains('button', 'Cancel').click()
      })

    cy.get('.fixed.inset-0').within(() => {
      cy.get('textarea').type(reason)
      cy.contains('button', 'Confirm Cancellation').click()
    })
    cy.contains('Reservation cancelled', { timeout: 10000 }).should('be.visible')

    cy.contains('button', /Cancelled/i).click()
    cy.contains(name, { timeout: 10000 }).should('be.visible')
    cy.contains(reason, { timeout: 10000 }).should('be.visible')
  })

  it('Back button closes the cancel modal without cancelling', () => {
    const name = `Back Button Test ${Date.now()}`
    createReservation(name)

    cy.visit('/reservations')
    cy.contains(name, { timeout: 10000 }).should('be.visible')
    cy.contains(name).parents('div').filter(':has(button:contains("Cancel"))').first()
      .within(() => {
        cy.contains('button', 'Cancel').click()
      })

    cy.get('.fixed.inset-0').within(() => {
      cy.contains('button', 'Back').click()
    })
    cy.contains('Cancel Reservation').should('not.exist')

    // still pending/ready, not cancelled
    cy.contains(name).should('be.visible')
  })
})