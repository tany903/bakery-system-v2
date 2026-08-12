describe('[functionality test] Stock Transfer from Production to Shop', () => {

  const transferQty = 1

  it('transfers 1 unit from production to shop and records the transfer', () => {
    cy.loginAsManager()
    cy.visit('/inventory')

    // =========================================================
    // FIND A PRODUCT THAT CAN ACTUALLY BE TRANSFERRED
    // =========================================================

    cy.get('table tbody tr:has(button:contains("Transfer"))')
      .first()
      .within(() => {

        // Save the product name so we can find the SAME product later
        cy.get('td')
          .first()
          .invoke('text')
          .then(text => {
            const productName = text.trim()

            cy.wrap(productName).as('transferProduct')
          })
      })

    // =========================================================
    // READ STOCK BEFORE TRANSFER
    // =========================================================

    cy.get('@transferProduct').then((productName) => {

      cy.contains('td', productName as string)
        .closest('tr')
        .within(() => {

          // Shop Stock
          cy.get('td')
            .eq(2)
            .invoke('text')
            .then(text => {

              const numbers = text.match(/[\d,.]+/)

              expect(numbers, `Could not read shop stock from "${text}"`)
                .to.not.be.null

              const shopStockBefore = parseFloat(
                numbers![0].replace(/,/g, '')
              )

              cy.wrap(shopStockBefore).as('shopStockBefore')
            })

          // Production Stock
          cy.get('td')
            .eq(3)
            .invoke('text')
            .then(text => {

              const numbers = text.match(/[\d,.]+/)

              expect(numbers, `Could not read production stock from "${text}"`)
                .to.not.be.null

              const prodStockBefore = parseFloat(
                numbers![0].replace(/,/g, '')
              )

              cy.wrap(prodStockBefore).as('prodStockBefore')
            })
        })

      // =========================================================
      // PERFORM TRANSFER
      // =========================================================

      cy.contains('td', productName as string)
        .closest('tr')
        .within(() => {
          cy.contains('button', 'Transfer').click()
        })

      cy.get('.fixed.inset-0')
        .should('be.visible')
        .within(() => {

          cy.contains('Transfer Stock')
            .should('be.visible')

          cy.get('input[type="number"]')
            .clear()
            .type(String(transferQty))

          cy.contains('button', 'Confirm Transfer')
            .click()
        })

      // Wait for success message
      cy.contains(/transferred|success/i, {
        timeout: 10000
      }).should('be.visible')

      // =========================================================
      // VERIFY SAME PRODUCT AFTER TRANSFER
      // =========================================================

      // Reload inventory so we get fresh stock values
      cy.visit('/inventory')

      cy.contains('td', productName as string, {
        timeout: 10000
      })
        .closest('tr')
        .should('be.visible')
        .within(() => {

          // -----------------------------------------------------
          // SHOP STOCK
          // -----------------------------------------------------

          cy.get('@shopStockBefore').then((shopStockBefore) => {

            cy.get('td')
              .eq(2)
              .invoke('text')
              .then(text => {

                const numbers = text.match(/[\d,.]+/)

                expect(
                  numbers,
                  `Could not read shop stock after transfer from "${text}"`
                ).to.not.be.null

                const shopStockAfter = parseFloat(
                  numbers![0].replace(/,/g, '')
                )

                expect(shopStockAfter).to.equal(
                  Number(shopStockBefore) + transferQty
                )
              })
          })

          // -----------------------------------------------------
          // PRODUCTION STOCK
          // -----------------------------------------------------

          cy.get('@prodStockBefore').then((prodStockBefore) => {

            cy.get('td')
              .eq(3)
              .invoke('text')
              .then(text => {

                const numbers = text.match(/[\d,.]+/)

                expect(
                  numbers,
                  `Could not read production stock after transfer from "${text}"`
                ).to.not.be.null

                const prodStockAfter = parseFloat(
                  numbers![0].replace(/,/g, '')
                )

                expect(prodStockAfter).to.equal(
                  Number(prodStockBefore) - transferQty
                )
              })
          })
        })

      // =========================================================
      // VERIFY TRANSFER APPEARS IN TRANSACTIONS
      // =========================================================

      cy.visit('/transactions')

      cy.contains('Stock Transfers')
        .click()

      cy.contains(productName as string, {
        timeout: 10000
      }).should('be.visible')
    })
  })


  // ===========================================================
  // OTHER INVENTORY FUNCTIONALITY TESTS
  // ===========================================================

  it('loads the inventory page with products listed', () => {
    cy.loginAsManager()
    cy.visit('/inventory')

    cy.contains('Inventory')
      .should('be.visible')

    cy.get('table tbody tr')
      .should('have.length.greaterThan', 0)
  })


  it('shows low stock products in low stock alert on dashboard', () => {
    cy.loginAsManager()
    cy.visit('/dashboard')

    cy.contains('Low Stock Alert')
      .should('be.visible')
  })


  it('search input is visible and enabled', () => {
    cy.loginAsManager()
    cy.visit('/inventory')

    cy.get('input[placeholder*="Search"]')
      .first()
      .should('be.visible')
      .and('not.be.disabled')
  })


  it('shows both shop and production stock columns', () => {
    cy.loginAsManager()
    cy.visit('/inventory')

    cy.contains('Shop Stock')
      .should('be.visible')

    cy.contains('Production Stock')
      .should('be.visible')
  })

})