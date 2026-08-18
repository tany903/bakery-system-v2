describe('[integration test] PO Receive → Ingredient Stock → Auto-Expense', () => {
  let ingredientName: string
  let stockBefore: number
  const supplierName = `Cypress Receive Test Supplier ${Date.now()}`

  function findPOCard() {
    return cy.contains(supplierName, { timeout: 15000 }).parents('.bg-white').first()
  }

  it('records baseline ingredient stock and creates + submits a PO', () => {
    cy.loginAsManager()
    cy.visit('/ingredients')
    cy.get('table tbody tr').first().within(() => {
      cy.get('td').first().invoke('text').then(name => { ingredientName = name.trim() })
      cy.get('td').eq(3).invoke('text').then(s => { stockBefore = parseInt(s.trim()) })
    })

    cy.then(() => {
      cy.loginAsProduction()
      cy.visit('/purchase-orders')
      cy.contains('button', 'New PO').click()

      cy.get('.fixed.inset-0').within(() => {
        cy.get('input[placeholder="e.g., ABC Supplies"]').type(supplierName)
        cy.get('select').eq(1).find('option').contains(ingredientName).then($opt => {
          cy.get('select').eq(1).select($opt.val() as string)
        })
        cy.get('input[placeholder="0"]').type('10')
        cy.get('input[placeholder="0.00"]').type('15')
        cy.contains('button', 'Create Purchase Order').click()
      })
      cy.get('.fixed.inset-0', { timeout: 10000 }).should('not.exist')

      cy.contains('button', 'Draft').click()
      findPOCard().within(() => {
        cy.contains('button', 'Submit').click()
      })
      cy.contains('PO submitted for approval', { timeout: 10000 }).should('be.visible')
    })
  })

  it('manager approves the PO', () => {
    cy.loginAsManager()
    cy.visit('/purchase-orders')
    cy.contains('button', 'Submitted').click()
    findPOCard().within(() => {
      cy.contains('button', 'Approve').click()
    })
    cy.contains('PO approved', { timeout: 10000 }).should('be.visible')
  })

  it('manager receives all items against a chosen expense category', () => {
    cy.loginAsManager()
    cy.visit('/purchase-orders')
    cy.contains('button', 'Approved').click()
    findPOCard().within(() => {
      cy.contains('button', 'Receive Items').click()
    })
    cy.get('.fixed.inset-0').within(() => {
      cy.get('select').find('option').not('[value=""]').first().then($opt => {
        cy.get('select').select($opt.val() as string)
      })
      cy.contains('button', 'Confirm Receipt').click()
    })
    cy.contains('Items received — ingredient stock updated & expense recorded', { timeout: 10000 }).should('be.visible')
  })

  it('ingredient stock increased by exactly 10', () => {
    cy.loginAsManager()
    cy.visit('/ingredients')
    cy.contains('table tbody tr', ingredientName).within(() => {
      cy.get('td').eq(3).invoke('text').should(text => {
        expect(parseInt(text.trim())).to.equal(stockBefore + 10)
      })
    })
  })

  it('a matching expense for ₱150.00 was auto-created', () => {
    cy.loginAsManager()
    cy.intercept('GET', '**/rest/v1/expenses*').as('expensesLoaded')
    cy.visit('/expenses')
    cy.wait('@expensesLoaded')

    cy.contains(supplierName, { timeout: 10000 }).parents('.bg-white').first().within(() => {
      cy.contains('₱150.00').should('be.visible')
    })
  })

  it('expense audit log shows a created entry for the PO expense', () => {
    cy.loginAsManager()
    cy.visit('/audit-logs')
    cy.contains('button', 'Expense Activity').click()

    cy.contains('td', supplierName, { timeout: 10000 }).parents('tr').within(() => {
      cy.contains(/created/i).should('be.visible')
    })
  })
})