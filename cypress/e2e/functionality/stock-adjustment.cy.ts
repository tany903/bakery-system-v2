describe('[functionality test] Stock Adjustment (Shop & Production)', () => {
  /**
   * Target Feature: Direct stock adjustment via /inventory "Shop"/"Production"
   * buttons (StockAdjustmentModal) — distinct from Transfer and Disposal.
   * Verifies: modal opens with live preview, adds/removes stock correctly,
   * blocks negative results, and both locations work independently.
   */

  beforeEach(() => {
    cy.loginAsManager()
    cy.visit('/inventory')
  })

  it('opens the Shop adjustment modal with current stock shown', () => {
    cy.get('table tbody tr').first().within(() => {
      cy.contains('button', 'Shop').click()
    })
    cy.get('.fixed.inset-0').within(() => {
      cy.contains('Adjust Stock').should('be.visible')
      cy.contains('shop').should('be.visible')
      cy.contains('Current Stock').should('be.visible')
      cy.get('input[type="number"]').should('be.visible')
      cy.contains('button', 'Confirm Adjustment').should('be.visible')
    })
    cy.contains('button', 'Cancel').click()
  })

  it('shows a live "New Stock Level" preview as quantity is typed', () => {
    cy.get('table tbody tr').first().within(() => {
      cy.contains('button', 'Shop').click()
    })
    cy.get('.fixed.inset-0').within(() => {
      cy.contains('New Stock Level').should('not.exist')
      cy.get('input[type="number"]').type('5')
      cy.contains('New Stock Level').should('be.visible')
    })
    cy.contains('button', 'Cancel').click()
  })

  it('increases shop stock by a positive adjustment', () => {
    cy.get('table tbody tr').first().within(() => {
      cy.get('td').eq(1).invoke('text').then(text => {
        const before = parseInt(text.trim())
        cy.wrap(before).as('stockBefore')
      })
      cy.contains('button', 'Shop').click()
    })

    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[type="number"]').type('5')
      cy.get('textarea').type('Cypress test adjustment (+5)')
      cy.contains('button', 'Confirm Adjustment').click()
    })
    cy.get('.fixed.inset-0', { timeout: 10000 }).should('not.exist')

    cy.get('@stockBefore').then((before) => {
      cy.get('table tbody tr').first().within(() => {
        cy.get('td').eq(1).invoke('text').should(text => {
          const after = parseInt(text.trim())
          expect(after).to.eq((before as unknown as number) + 5)
        })
      })
    })
  })

  it('decreases shop stock by a negative adjustment', () => {
    cy.get('table tbody tr').first().within(() => {
      cy.get('td').eq(1).invoke('text').then(text => {
        const before = parseInt(text.trim())
        cy.wrap(before).as('stockBefore')
      })
      cy.contains('button', 'Shop').click()
    })

    cy.get('.fixed.inset-0').within(() => {
      cy.get('input[type="number"]').type('-3')
      cy.contains('button', 'Confirm Adjustment').click()
    })
    cy.get('.fixed.inset-0', { timeout: 10000 }).should('not.exist')

    cy.get('@stockBefore').then((before) => {
      cy.get('table tbody tr').first().within(() => {
        cy.get('td').eq(1).invoke('text').should(text => {
          const after = parseInt(text.trim())
          expect(after).to.eq((before as unknown as number) - 3)
        })
      })
    })
  })

  it('blocks an adjustment that would take stock below zero', () => {
    cy.get('table tbody tr').first().within(() => {
      cy.get('td').eq(1).invoke('text').then(text => {
        const current = parseInt(text.trim())
        cy.wrap(current).as('stockBefore')
      })
      cy.contains('button', 'Shop').click()
    })

    cy.get('@stockBefore').then((current) => {
      const tooMuch = -((current as unknown as number) + 1000)
      cy.get('.fixed.inset-0').within(() => {
        cy.get('input[type="number"]').type(String(tooMuch))
        cy.contains('button', 'Confirm Adjustment').click()
        cy.contains('Cannot reduce stock below 0').should('be.visible')
      })
    })
  })

  it('requires a non-zero quantity before Confirm is enabled', () => {
    cy.get('table tbody tr').first().within(() => {
      cy.contains('button', 'Shop').click()
    })
    cy.get('.fixed.inset-0').within(() => {
      cy.contains('button', 'Confirm Adjustment').should('be.disabled')
      cy.get('input[type="number"]').type('0')
      cy.contains('button', 'Confirm Adjustment').click()
      cy.contains('Please enter a valid quantity').should('be.visible')
    })
  })

  it('adjusts Production stock independently from Shop stock', () => {
    cy.get('table tbody tr').first().within(() => {
      cy.get('td').eq(2).invoke('text').then(text => {
        const before = parseInt(text.trim())
        cy.wrap(before).as('prodStockBefore')
      })
      cy.contains('button', 'Production').click()
    })

    cy.get('.fixed.inset-0').within(() => {
      cy.contains('production').should('be.visible')
      cy.get('input[type="number"]').type('4')
      cy.contains('button', 'Confirm Adjustment').click()
    })
    cy.get('.fixed.inset-0', { timeout: 10000 }).should('not.exist')

    cy.get('@prodStockBefore').then((before) => {
      cy.get('table tbody tr').first().within(() => {
        cy.get('td').eq(2).invoke('text').should(text => {
          const after = parseInt(text.trim())
          expect(after).to.eq((before as unknown as number) + 4)
        })
      })
    })
  })
})