describe('[functionality test] Transactions Filtering', () => {
  beforeEach(() => {
    cy.loginAsManager()
    cy.visit('/transactions')
    cy.contains('h1', 'Transactions').should('be.visible')
    cy.contains('Sales').click()
  })

  // helper: only the Sales table's rows, not the Cash Register Entries table below it
  function salesRows() {
    return cy.contains('h2', 'Sales').parents('.bg-white').first().find('table tbody tr')
  }

  it('shows Sales tab by default with records', () => {
    cy.contains('Sales').should('be.visible')
    salesRows().should('have.length.greaterThan', 0)
  })

  it('switches to Stock Transfers tab', () => {
    cy.contains('Stock Transfers').click()
    cy.contains('Stock Transfers').should('be.visible')
  })

  it('switches to Production Records tab', () => {
    cy.contains('Production Records').click()
    cy.contains('Production Records').should('be.visible')
  })

  it('switches to Disposals tab', () => {
    cy.contains('Disposals').click()
    cy.contains('Disposals').should('be.visible')
  })

  it('filters sales by cash payment method', () => {
    cy.contains('Sales').click()
    cy.get('select').contains('All').parents('select').first().select('cash')
    salesRows().each($row => {
      cy.wrap($row).find('td').then($tds => {
        expect($tds.text().toLowerCase()).to.include('cash')
      })
    })
  })

  it('filters sales by online payment method', () => {
    cy.contains('Sales').click()
    cy.get('select').contains('All').parents('select').first().select('online')
    salesRows().each($row => {
      cy.wrap($row).find('td').then($tds => {
        expect($tds.text().toLowerCase()).to.include('online')
      })
    })
  })

  it('filters sales by voided status', () => {
    cy.contains('Sales').click()
    cy.get('select').eq(1).select('voided')
    salesRows().each($row => {
      cy.wrap($row).contains('VOIDED').should('be.visible')
    })
  })

  it('filters sales by active status hides voided', () => {
    cy.contains('Sales').click()
    cy.get('select').eq(1).select('active')
    salesRows().each($row => {
      cy.wrap($row).contains('VOIDED').should('not.exist')
    })
  })

  it('search by sale number narrows results', () => {
    cy.contains('Sales').click()
    salesRows().first().find('td').eq(2).invoke('text').then(saleNum => {
      const num = saleNum.trim()
      cy.get('input[placeholder*="Sale #" i]').type(num)
      salesRows().should('have.length', 1)
      cy.contains(num).should('be.visible')
    })
  })

  it('shows pagination controls on sales tab', () => {
    cy.contains('Sales').click()
    cy.contains(/Page \d+ of \d+|Showing \d+/i).should('be.visible')
  })
})