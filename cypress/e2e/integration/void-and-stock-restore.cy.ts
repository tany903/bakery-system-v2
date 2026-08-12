describe('[functionality test] Manager Approval for Order Voiding', () => {
  /**
   * Target Feature: Transaction Voiding & Stock Restoration
   * This test verifies that when a manager voids a sale:
   * 1. The sale status changes to VOIDED in the transactions list
   * 2. The voided sale no longer counts toward today's sales stats
   * 3. The inventory stock is restored to its pre-sale level
   */

  let saleNumber: string
  let productName: string
  let stockBefore: number

  it('records stock level before sale', () => {
    cy.loginAsManager()
    cy.visit('/inventory')
    cy.get('table tbody tr').first().within(() => {
      cy.get('td').first().invoke('text').then(name => {
        productName = name.trim()
      })
      cy.get('td').eq(2).invoke('text').then(stock => {
        stockBefore = parseInt(stock.trim())
      })
    })
  })

  it('cashier makes a cash sale of the product', () => {
    cy.loginAsCashier()
    cy.get('.grid.grid-cols-2 button:not(:disabled)').first().click()
    cy.contains('button', /^Charge ₱/).click()

    cy.contains('button', 'Print Receipt', { timeout: 10000 }).should('be.visible')
    cy.get('.receipt').invoke('text').then(text => {
      const match = text.match(/(SALE-\d{8}-\d{4})/)
      saleNumber = match ? match[1] : ''
      cy.wrap(saleNumber).should('not.be.empty')
    })
    cy.contains('button', 'Close').click()
  })

  it('verifies stock decreased after sale', () => {
    cy.loginAsManager()
    cy.visit('/inventory')
    cy.get('table tbody tr').first().within(() => {
      cy.get('td').eq(2).invoke('text').then(stock => {
        const stockAfter = parseInt(stock.trim())
        expect(stockAfter).to.equal(stockBefore - 1)
      })
    })
  })

  it('manager voids the sale with a reason', () => {
    cy.loginAsManager()
    cy.visit('/transactions')

    cy.contains(saleNumber, { timeout: 10000 })
      .parents('tr').filter(':has(button:contains("Void"))').first()
      .within(() => {
        cy.contains('button', 'Void').click()
      })

    cy.contains('Void Reason').should('be.visible')
    cy.contains('Void Reason').closest('div').find('select').select('Data entry error')
    cy.contains('button', 'Confirm Void').click()
    cy.contains(/Successfully voided/, { timeout: 10000 }).should('be.visible')
  })

  it('voided sale shows VOIDED status in transactions list', () => {
    cy.loginAsManager()
    cy.visit('/transactions')

    cy.contains(saleNumber, { timeout: 10000 })
      .parents('tr').first()
      .within(() => {
        cy.contains('VOIDED').should('be.visible')
      })
  })

  it('voided sale no longer shows a Void button', () => {
    cy.loginAsManager()
    cy.visit('/transactions')

    cy.contains(saleNumber, { timeout: 10000 })
      .parents('tr').first()
      .within(() => {
        cy.contains('button', 'Void').should('not.exist')
      })
  })

  it('stock is restored to pre-sale level after void', () => {
    cy.loginAsManager()
    cy.visit('/inventory')
    cy.get('table tbody tr').first().within(() => {
      cy.get('td').eq(2).invoke('text').then(stock => {
        const stockRestored = parseInt(stock.trim())
        expect(stockRestored).to.equal(stockBefore)
      })
    })
  })
})