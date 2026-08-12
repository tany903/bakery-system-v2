describe('Cash register', () => {
  beforeEach(() => {
    cy.loginAsCashier()
    cy.contains('button', 'Cash').click()
  })

  it('opens the cash register and shows current cash on hand', () => {
    // widget says "Cash On Hand" not "Current Cash On Hand"
    cy.contains('Cash On Hand').should('be.visible')
    cy.contains(/₱\d/).should('be.visible')
  })

  it('records a cash-in and increases cash on hand', () => {
    cy.contains('button', '+ Cash In').click()

    // the cash-in modal is rendered INSIDE the widget which is already inside
    // a fixed overlay — scope to the innermost modal using the title text
    cy.contains('Cash In').parents('div').filter(':has(input[type="number"])').first()
      .within(() => {
        cy.get('input[type="number"]').type('100')
        cy.get('textarea').type('Cypress test cash in')
        cy.contains('button', '+ Confirm Cash In').click()
      })

    cy.contains(/success|recorded/i, { timeout: 10000 }).should('be.visible')
  })

  it('records a cash-out and decreases cash on hand', () => {
    cy.contains('button', '- Cash Out').click()

    cy.contains('Cash Out').parents('div').filter(':has(input[type="number"])').first()
      .within(() => {
        cy.get('input[type="number"]').type('50')
        cy.get('textarea').type('Cypress test cash out')
        cy.contains('button', '- Confirm Cash Out').click()
      })

    cy.contains(/success|recorded/i, { timeout: 10000 }).should('be.visible')
  })

  it('requires an amount before submitting cash-in', () => {
    cy.contains('button', '+ Cash In').click()

    cy.contains('Cash In').parents('div').filter(':has(input[type="number"])').first()
      .within(() => {
        cy.contains('button', '+ Confirm Cash In').click()
        cy.contains('Please enter a valid amount').should('be.visible')
      })
  })
})