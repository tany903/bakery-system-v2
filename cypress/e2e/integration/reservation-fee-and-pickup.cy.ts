describe('Advance order / reservation', () => {
  beforeEach(() => {
    cy.loginAsCashier()

    cy.contains('button', 'Advance Order')
      .should('be.visible')
      .click()

    cy.contains('Reserve products with a 50% deposit')
      .should('be.visible')
  })

  it('requires a customer name before submitting', () => {
    cy.get('input[placeholder="e.g., Maria Santos"]')
      .type(' ')

    cy.get('select')
      .first()
      .select(1)

    cy.get('input[placeholder="Quantity"]')
      .type('2')

    cy.contains('button', 'Confirm Reservation & Collect Fee')
      .click()

    cy.contains('Customer name is required')
      .should('be.visible')
  })

  function extractPeso(text: string): number {
    const match = text.match(/₱([\d,]+\.\d{2})/)

    return match
      ? parseFloat(match[1].replace(/,/g, ''))
      : NaN
  }

  it('computes a 50% fee and remaining balance from the order total', () => {
    cy.get('input[placeholder="e.g., Maria Santos"]')
      .type('Test Customer')

    cy.get('select')
      .first()
      .select(1)

    cy.get('input[placeholder="Quantity"]')
      .type('3')

    cy.contains('Total Order Value')
      .parent()
      .invoke('text')
      .then(totalText => {
        const total = extractPeso(totalText)

        expect(total).to.be.greaterThan(0)

        cy.contains('Fee to Collect Now (50%)')
          .parent()
          .invoke('text')
          .then(feeText => {
            const fee = extractPeso(feeText)

            expect(fee).to.be.closeTo(total / 2, 0.01)
          })

        cy.contains('Balance Due at Pickup')
          .parent()
          .invoke('text')
          .then(balanceText => {
            const balance = extractPeso(balanceText)

            expect(balance).to.be.closeTo(total / 2, 0.01)
          })
      })
  })

  it('creates the reservation and shows the fee/balance confirmation', () => {
    cy.get('input[placeholder="e.g., Maria Santos"]')
      .type('Test Customer')

    cy.get('input[placeholder="09xx-xxx-xxxx"]')
      .type('09171234567')

    cy.get('select')
      .first()
      .select(1)

    cy.get('input[placeholder="Quantity"]')
      .type('1')

    cy.contains('button', 'Confirm Reservation & Collect Fee')
      .should('be.visible')
      .click()

    cy.contains(
      /Reservation created — fee of ₱.+ collected, balance ₱.+ due at pickup/,
      { timeout: 10000 }
    ).should('be.visible')
  })
})


describe('Reservation pickup flow', () => {

  it('creates a reservation, then completes pickup and marks it Completed', () => {

    // =====================================================
    // 1. CASHIER CREATES RESERVATION
    // =====================================================

    cy.loginAsCashier()

    cy.contains('button', 'Advance Order')
      .should('be.visible')
      .click()

    cy.contains('Reserve products with a 50% deposit')
      .should('be.visible')

    const customerName = `Pickup Test Customer ${Date.now()}`

    cy.get('input[placeholder="e.g., Maria Santos"]')
      .type(customerName)

    cy.get('select')
      .first()
      .select(1)

    cy.get('input[placeholder="Quantity"]')
      .type('1')

    cy.contains('button', 'Confirm Reservation & Collect Fee')
      .should('be.visible')
      .click()

    cy.contains(/Reservation created/, {
      timeout: 10000
    }).should('be.visible')


    // =====================================================
    // 2. MANAGER OPENS RESERVATIONS
    // =====================================================

    cy.loginAsManager()

    cy.visit('/reservations')

    cy.contains('Reservations', {
      timeout: 10000
    }).should('be.visible')


    // =====================================================
    // 3. OPEN PENDING TAB
    // =====================================================

    cy.contains('button', /^Pending\b/i)
      .should('be.visible')
      .click()


    // =====================================================
    // 4. FIND OUR RESERVATION
    // =====================================================

    cy.contains(customerName, {
      timeout: 15000
    }).should('be.visible')

    cy.contains(customerName, {
      timeout: 15000
    })
      .closest('div.bg-white.rounded-sm.overflow-hidden.flex.flex-col')
      .as('reservationCard')


    // =====================================================
    // 5. VERIFY IT IS PENDING
    // =====================================================

    cy.get('@reservationCard')
      .should('be.visible')
      .and('contain.text', 'Pending')


    // =====================================================
    // 6. CLICK COMPLETE PICKUP
    // =====================================================

    cy.get('@reservationCard')
      .contains('button', /^Complete Pickup$/)
      .should('be.visible')
      .scrollIntoView()
      .click()


    // =====================================================
    // 7. VERIFY COMPLETE PICKUP MODAL
    // =====================================================

    cy.get('.fixed.inset-0', {
      timeout: 10000
    })
      .should('be.visible')
      .within(() => {

        cy.contains('h2', 'Complete Pickup')
          .should('be.visible')

        cy.contains(customerName)
          .should('be.visible')

        cy.contains('Total Order')
          .should('be.visible')

        cy.contains('Already Paid (fee)')
          .should('be.visible')

        cy.contains('Collect Now')
          .should('be.visible')


        // =================================================
        // 8. SELECT CASH
        // =================================================

        cy.contains('button', /Cash/i)
          .should('be.visible')
          .click()


        // =================================================
        // 9. CLICK CONFIRM COLLECT
        //
        // Don't depend on whether the UI uses:
        //
        // Confirm - Collect
        // Confirm – Collect
        // Confirm — Collect
        //
        // Match the important words instead.
        // =================================================

        cy.contains('button', /Confirm.*Collect/i)
          .should('be.visible')
          .scrollIntoView()
          .click()
      })


    // =====================================================
    // 10. WAIT FOR PICKUP SUCCESS
    // =====================================================

    cy.contains('Pickup completed — sale recorded', {
      timeout: 15000
    }).should('be.visible')


    // =====================================================
    // 11. RELOAD RESERVATIONS
    // =====================================================

    cy.visit('/reservations')

    cy.contains('Reservations', {
      timeout: 10000
    }).should('be.visible')


    // =====================================================
    // 12. OPEN COMPLETED TAB
    // =====================================================

    cy.contains('button', /^Completed\b/i)
      .should('be.visible')
      .click()


    // =====================================================
    // 13. VERIFY RESERVATION IS NOW COMPLETED
    // =====================================================

    cy.contains(customerName, {
      timeout: 15000
    }).should('be.visible')

    cy.contains(customerName, {
      timeout: 15000
    })
      .closest('div.bg-white.rounded-sm.overflow-hidden.flex.flex-col')
      .should('contain.text', 'Completed')
  })
})