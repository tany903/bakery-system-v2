describe('[functionality test] Stock Disposal (Pull-out & On The House)', () => {
  /**
   * Target Feature: Inventory Disposal Module
   * Disposal is done by the CASHIER on the /inventory page.
   * Manager views the results in /transactions > Disposals tab.
   * Verifies: pull-out modal opens, reason dropdown works,
   * OTH modal opens, disposal recorded and visible to manager.
   */

  it('cashier sees Pull-out and OTH buttons on inventory', () => {
    cy.loginAsCashier()
    cy.visit('/inventory')
    cy.contains('button', 'Pull-out').should('be.visible')
    cy.contains('button', 'OTH').should('be.visible')
  })

  it('opens pull-out disposal modal with reason dropdown', () => {
    cy.loginAsCashier()
    cy.visit('/inventory')

    cy.get('table tbody tr').first().within(() => {
      cy.contains('button', 'Pull-out').click()
    })

    cy.get('.fixed.inset-0').within(() => {
      cy.contains('Pull-out Stock').should('be.visible')
      cy.get('select').should('be.visible')
      cy.get('input[type="number"]').should('be.visible')
      cy.contains('button', 'Confirm Pull-out').should('be.visible')
    })
    cy.contains('button', 'Cancel').click()
  })

  it('opens OTH (On the House) modal with reason dropdown', () => {
    cy.loginAsCashier()
    cy.visit('/inventory')

    cy.get('table tbody tr').first().within(() => {
      cy.contains('button', 'OTH').click()
    })

    cy.get('.fixed.inset-0').within(() => {
      cy.contains('On the House').should('be.visible')
      cy.get('select').should('be.visible')
      cy.get('input[type="number"]').should('be.visible')
      cy.contains('button', 'Confirm OTH').should('be.visible')
    })
    cy.contains('button', 'Cancel').click()
  })

  it('records a pull-out disposal successfully', () => {
    cy.loginAsCashier()
    cy.visit('/inventory')

    cy.get('table tbody tr').first().within(() => {
      // grab the stock number before disposal, e.g. "33 / 10" -> 33
      cy.get('td').eq(2).invoke('text').then(text => {
        const before = parseInt(text.trim())
        cy.wrap(before).as('stockBefore')
      })
      cy.contains('button', 'Pull-out').click()
    })

    cy.get('.fixed.inset-0').within(() => {
      cy.get('select').find('option').not('[value=""]').first().then($opt => {
        cy.get('select').select($opt.val() as string)
      })
      cy.get('input[type="number"]').type('1')
      cy.contains('button', 'Confirm Pull-out').click()
    })

    // modal should close on success (it stays open with an error on failure)
    cy.get('.fixed.inset-0', { timeout: 10000 }).should('not.exist')

    // stock should have decremented by 1
    cy.get('@stockBefore').then((before) => {
      cy.get('table tbody tr').first().within(() => {
        cy.get('td').eq(2).invoke('text').should(text => {
          const after = parseInt(text.trim())
          expect(after).to.eq((before as unknown as number) - 1)
        })
      })
    })
  })

  it('manager can see the disposal in transactions disposals tab', () => {
    cy.loginAsManager()
    cy.visit('/transactions')
    cy.contains('Disposals').click()
    cy.get('table tbody tr').should('have.length.greaterThan', 0)
  })

  it('disposal record shows reason in manager transactions', () => {
    cy.loginAsManager()
    cy.visit('/transactions')
    cy.contains('Disposals').click()
    cy.contains(/Mold|Dropped|Wrong bake|Burnt|Expired|Customer goodwill|Staff meal|Sampling|Complaint/i)
      .should('be.visible')
  })
})