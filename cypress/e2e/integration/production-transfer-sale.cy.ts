describe('[integration test] Production Batch → Shop Transfer → POS Sale', () => {
  const productName = 'Sprite'
  let shopBefore: number
  let prodBefore: number

  Cypress.on('uncaught:exception', (err) => {
    if (err.name === 'AbortError' || /signal is aborted/i.test(err.message)) {
      return false
    }
  })

  function findProductRow() {
    return cy.contains('table tbody tr', productName)
  }

  it('records baseline stock and logs a production batch of 2 units', () => {
    cy.loginAsManager()
    cy.visit('/inventory')
    findProductRow().within(() => {
      cy.get('td').eq(1).invoke('text').then(s => { shopBefore = parseInt(s.trim()) })
      cy.get('td').eq(2).invoke('text').then(s => { prodBefore = parseInt(s.trim()) })
    })

    cy.then(() => {
      cy.loginAsProduction()
      cy.visit('/production')
      cy.contains('button', 'Record Production').click()
      cy.get('.fixed.inset-0').within(() => {
        cy.get('select').first().find('option').contains(productName).then($opt => {
          cy.get('select').first().select($opt.val() as string)
        })
        cy.get('input[placeholder="e.g., 50"]').clear().type('2')
        cy.contains('button', 'Record Production').click()
      })
      cy.get('.fixed.inset-0', { timeout: 10000 }).should('not.exist')
    })
  })

  it('production stock increased, then manager transfers 2 units to shop — in one continuous flow', () => {
    cy.loginAsManager()
    cy.visit('/inventory')

    findProductRow().within(() => {
      cy.get('td').eq(2).invoke('text').should(text => {
        expect(parseInt(text.trim())).to.equal(prodBefore + 2)
      })
    })

    findProductRow().within(() => {
      cy.contains('button', 'Transfer', { timeout: 10000 }).click()
    })
    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[type="number"]').clear().type('2')
      cy.contains('button', 'Confirm Transfer').click()
    })
    cy.contains(/transferred|success/i, { timeout: 10000 }).should('be.visible')
  })

  it('shop stock increased and production decreased by 2 after transfer', () => {
    cy.loginAsManager()
    cy.visit('/inventory')
    findProductRow().within(() => {
      cy.get('td').eq(1).invoke('text').should(text => {
        expect(parseInt(text.trim())).to.equal(shopBefore + 2)
      })
      cy.get('td').eq(2).invoke('text').should(text => {
        expect(parseInt(text.trim())).to.equal(prodBefore)
      })
    })
  })

  it('cashier sells 1 unit of that product from shop', () => {
    cy.loginAsCashier()
    cy.visit('/pos')
    cy.contains('button', productName).click()
    cy.get('input[type="number"]').first().clear().type('1000')
    cy.contains('button', /^Charge ₱/).should('not.be.disabled').click()
    cy.contains('button', 'Print Receipt', { timeout: 10000 }).should('be.visible')
    cy.contains('button', 'Close').click()
  })

  it('shop stock decreased by 1 after sale', () => {
    cy.loginAsManager()
    cy.visit('/inventory')
    findProductRow().within(() => {
      cy.get('td').eq(1).invoke('text').should(text => {
        expect(parseInt(text.trim())).to.equal(shopBefore + 1)
      })
    })
  })

  it('audit log shows production, transfer and sale events for that product', () => {
    cy.loginAsManager()
    cy.visit('/audit-logs')
    cy.contains('button', 'Inventory Transactions').click()
    cy.contains('label', 'Product').parent().find('select').select(productName)
    cy.get('table tbody tr', { timeout: 10000 }).should('have.length.greaterThan', 0)
    cy.contains('production').should('be.visible')
    cy.contains('transfer').should('be.visible')
    cy.contains('sale').should('be.visible')
  })
})