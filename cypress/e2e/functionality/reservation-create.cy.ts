describe('Advance order / reservation', () => {
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