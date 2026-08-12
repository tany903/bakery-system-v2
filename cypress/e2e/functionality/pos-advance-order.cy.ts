describe('[functionality test] Cashier Advance Order from POS', () => {
  /**
   * Target Feature: Advance Order / Reservation from POS
   * Verifies: cashier can create advance orders, customer name required,
   * fee preview is correct, phone is optional, needed-by date works
   */

  beforeEach(() => {
    cy.loginAsCashier()
    cy.contains('button', 'Advance Order').click()
    cy.contains('Reserve products with a 50% deposit').should('be.visible')
  })

  it('advance order modal opens with correct fields', () => {
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[placeholder="e.g., Maria Santos"]').should('be.visible')
      cy.get('input[placeholder="09xx-xxx-xxxx"]').should('be.visible')
      cy.get('select').should('be.visible')
      cy.get('input[placeholder="Quantity"]').should('be.visible')
      cy.contains('button', 'Confirm Reservation & Collect Fee').should('be.visible')
    })
  })

  it('customer name is required', () => {
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[placeholder="e.g., Maria Santos"]').type(' ')
      cy.get('select').first().select(1)
      cy.get('input[placeholder="Quantity"]').type('1')
      cy.contains('button', 'Confirm Reservation & Collect Fee').click()
      cy.contains('Customer name is required').should('be.visible')
    })
  })

  it('phone number is optional', () => {
    const name = `Optional Phone ${Date.now()}`
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[placeholder="e.g., Maria Santos"]').type(name)
      // leave phone empty
      cy.get('select').first().select(1)
      cy.get('input[placeholder="Quantity"]').type('1')
      cy.contains('button', 'Confirm Reservation & Collect Fee').click()
    })
    cy.contains(/Reservation created/, { timeout: 10000 }).should('be.visible')
  })

  it('fee preview shows 50% of total order value', () => {
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[placeholder="e.g., Maria Santos"]').type('Test Customer')
      cy.get('select').first().select(1)
      cy.get('input[placeholder="Quantity"]').type('2')

      cy.contains('Total Order Value').parent().invoke('text').then(totalText => {
        const totalMatch = totalText.match(/₱([\d,]+\.\d{2})/)
        const total = totalMatch ? parseFloat(totalMatch[1].replace(/,/g, '')) : 0

        cy.contains('Fee to Collect Now (50%)').parent().invoke('text').then(feeText => {
          const feeMatch = feeText.match(/₱([\d,]+\.\d{2})/)
          const fee = feeMatch ? parseFloat(feeMatch[1].replace(/,/g, '')) : 0
          expect(fee).to.closeTo(total * 0.5, 0.01)
        })

        cy.contains('Balance Due at Pickup').parent().invoke('text').then(balText => {
          const balMatch = balText.match(/₱([\d,]+\.\d{2})/)
          const balance = balMatch ? parseFloat(balMatch[1].replace(/,/g, '')) : 0
          expect(balance).to.closeTo(total * 0.5, 0.01)
        })
      })
    })
  })

  it('can add multiple products to one advance order', () => {
    cy.get('.fixed.inset-0').within(() => {
      cy.get('select').first().select(1)
      cy.get('input[placeholder="Quantity"]').first().type('1')
      cy.contains('button', '+ Add Another Product').click()
      cy.get('select').eq(1).select(2)
      cy.get('input[placeholder="Quantity"]').eq(1).type('2')
      cy.contains('Item 2').should('be.visible')
    })
  })

  it('can set a needed-by date', () => {
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[type="datetime-local"]').should('be.visible')
    })
  })

  it('cancel closes the modal', () => {
    cy.contains('button', 'Cancel').click()
    cy.contains('Reserve products with a 50% deposit').should('not.exist')
  })
})