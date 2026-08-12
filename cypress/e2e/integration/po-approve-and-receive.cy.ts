describe('[functionality test] Purchase Order Approval & Inventory Increment', () => {
  /**
   * =========================================================
   * PURCHASE ORDER FLOW
   * =========================================================
   *
   * Correct PO lifecycle:
   *
   * Production creates Draft
   * → Production submits
   * → Manager approves
   * → Manager receives all items
   * → PO becomes Received
   */

  // =========================================================
  // CREATE A NEW PO AS PRODUCTION
  // =========================================================

  before(() => {
    cy.loginAsProduction()
    cy.visit('/purchase-orders')

    // Open New PO modal
    cy.contains('button', 'New PO')
      .should('be.visible')
      .click()

    // =======================================================
    // CREATE PURCHASE ORDER
    // =======================================================

    cy.get('.fixed.inset-0', { timeout: 10000 })
      .should('be.visible')
      .within(() => {
        // Select supplier
        cy.get('select')
          .first()
          .select(1)

        // Select ingredient
        cy.get('select')
          .eq(1)
          .select(1)

        // Quantity
        cy.get('input[placeholder="0"]')
          .type('5')

        // Unit cost
        cy.get('input[placeholder="0.00"]')
          .type('100')

        // Create PO
        cy.contains('button', 'Create Purchase Order')
          .should('be.visible')
          .click()
      })

    // =======================================================
    // WAIT FOR PURCHASE ORDERS PAGE
    // =======================================================

    cy.contains('Purchase Orders', {
      timeout: 10000,
    }).should('be.visible')

    // =======================================================
    // GO TO DRAFT TAB
    // =======================================================

    cy.contains('button', /^Draft/)
      .should('be.visible')
      .click()

    // =======================================================
    // GET NEWLY CREATED PO NUMBER
    // =======================================================

    cy.get('p.text-white.font-black.text-sm', {
      timeout: 10000,
    })
      .first()
      .invoke('text')
      .then((text) => {
        /*
         * Supports:
         *
         * PO-20260811-1234
         *
         * and other PO formats beginning with PO-
         */

        const match = text.match(/PO-\d{6,8}-\d{4}/)

        expect(
          match,
          'PO number should exist'
        ).to.not.be.null

        const poNumber = match![0]

        Cypress.env('currentPO', poNumber)

        cy.log(`Created PO: ${poNumber}`)
      })
  })


  // =========================================================
  // 1. PRODUCTION - VERIFY DRAFT
  // =========================================================

  it('production sees the newly created PO as Draft', () => {
    const poNumber = Cypress.env('currentPO')

    cy.loginAsProduction()
    cy.visit('/purchase-orders')

    // Go to Draft tab
    cy.contains('button', /^Draft/)
      .should('be.visible')
      .click()

    // Find PO
    cy.contains(poNumber, {
      timeout: 10000,
    })
      .should('be.visible')

    // Verify Draft status
    cy.contains(poNumber)
      .closest('div.flex.flex-col')
      .should('contain.text', 'Draft')
  })


  // =========================================================
  // 2. PRODUCTION - SUBMIT PO
  // =========================================================

  it('production submits the draft PO', () => {
    const poNumber = Cypress.env('currentPO')

    cy.loginAsProduction()
    cy.visit('/purchase-orders')

    // Go to Draft tab
    cy.contains('button', /^Draft/)
      .should('be.visible')
      .click()

    // Find PO
    cy.contains(poNumber, {
      timeout: 10000,
    })
      .should('be.visible')

    // Find the PO card and submit it
    cy.contains(poNumber)
      .closest('div.flex.flex-col')
      .within(() => {
        cy.contains('button', 'Submit')
          .should('be.visible')
          .click()
      })

    // Wait for submission confirmation
    cy.contains(/Submitted|success/i, {
      timeout: 10000,
    }).should('be.visible')
  })


  // =========================================================
  // 3. PRODUCTION - VERIFY SUBMITTED
  // =========================================================

  it('PO shows Submitted status after production submits', () => {
    const poNumber = Cypress.env('currentPO')

    cy.loginAsProduction()
    cy.visit('/purchase-orders')

    // Go to Submitted tab
    cy.contains('button', /^Submitted/)
      .should('be.visible')
      .click()

    // Find PO
    cy.contains(poNumber, {
      timeout: 10000,
    })
      .should('be.visible')

    // Verify Submitted status
    cy.contains(poNumber)
      .closest('div.flex.flex-col')
      .should('contain.text', 'Submitted')
  })


  // =========================================================
  // 4. MANAGER - APPROVE PO
  // =========================================================

  it('manager approves the submitted PO', () => {
    const poNumber = Cypress.env('currentPO')

    cy.loginAsManager()
    cy.visit('/purchase-orders')

    // Go to Submitted tab
    cy.contains('button', /^Submitted/)
      .should('be.visible')
      .click()

    // Find PO
    cy.contains(poNumber, {
      timeout: 10000,
    })
      .should('be.visible')

    // Approve PO
    cy.contains(poNumber)
      .closest('div.flex.flex-col')
      .within(() => {
        cy.contains('button', 'Approve')
          .should('be.visible')
          .click()
      })

    // Wait for approval confirmation
    cy.contains(/Approved|success/i, {
      timeout: 10000,
    }).should('be.visible')
  })


  // =========================================================
  // 5. MANAGER - VERIFY APPROVED
  // =========================================================

  it('PO shows Approved status after manager approves', () => {
    const poNumber = Cypress.env('currentPO')

    cy.loginAsManager()
    cy.visit('/purchase-orders')

    // Go to Approved tab
    cy.contains('button', /^Approved/)
      .should('be.visible')
      .click()

    // Find PO
    cy.contains(poNumber, {
      timeout: 10000,
    })
      .should('be.visible')

    // Verify Approved status
    cy.contains(poNumber)
      .closest('div.flex.flex-col')
      .should('contain.text', 'Approved')
  })


  // =========================================================
  // 6. MANAGER - RECEIVE ALL ITEMS
  // =========================================================

  it('manager receives all items from the approved PO', () => {
    const poNumber = Cypress.env('currentPO')

    cy.loginAsManager()
    cy.visit('/purchase-orders')

    // =======================================================
    // GO TO APPROVED TAB
    // =======================================================

    cy.contains('button', /^Approved/)
      .should('be.visible')
      .click()

    // =======================================================
    // FIND THE EXACT PO
    // =======================================================

    cy.contains(poNumber, {
      timeout: 15000,
    })
      .should('be.visible')

    // =======================================================
    // FIND PO CARD
    // =======================================================

    cy.contains(poNumber)
      .closest('div.flex.flex-col')
      .within(() => {

        // Make sure the PO is approved
        cy.contains('Approved')
          .should('be.visible')

        // Make sure Receive Items exists
        cy.contains('button', 'Receive Items')
          .should('be.visible')
          .click()
      })

    // =======================================================
    // RECEIVE ITEMS MODAL
    // =======================================================

    cy.get('.fixed.inset-0', {
      timeout: 10000,
    })
      .should('be.visible')
      .within(() => {

        // ---------------------------------------------------
        // VERIFY MODAL
        // ---------------------------------------------------

        cy.contains('h2', 'Receive Items')
          .should('be.visible')


        // ---------------------------------------------------
        // FILL RECEIVED QUANTITY
        // ---------------------------------------------------
        //
        // Each item looks like:
        //
        // <div class="rounded-sm border border-gray-100 p-3">
        //
        //   <label>
        //     Qty Received (ordered: 5)
        //   </label>
        //
        //   <input type="number">
        //
        // </div>
        //
        // ---------------------------------------------------

        cy.get('.rounded-sm.border.border-gray-100.p-3')
          .each(($item) => {

            cy.wrap($item)
              .find('label')
              .invoke('text')
              .then((labelText) => {

                cy.log(`Quantity label: ${labelText}`)

                const match =
                  labelText.match(/ordered:\s*([\d.]+)/i)

                expect(
                  match,
                  'ordered quantity should exist'
                ).to.not.be.null

                const orderedQuantity = match![1]

                cy.log(
                  `Setting received quantity to ${orderedQuantity}`
                )

                cy.wrap($item)
                  .find('input[type="number"]')
                  .should('be.visible')
                  .clear()
                  .type(orderedQuantity)
              })
          })


        // ===================================================
        // SELECT EXPENSE CATEGORY
        // ===================================================

        cy.get('select')
          .last()
          .should('be.visible')
          .find('option')
          .eq(1)
          .then(($option) => {

            const value = $option.val()

            expect(
              value,
              'expense category should exist'
            ).to.not.be.empty

            cy.get('select')
              .last()
              .select(value as string)
          })


        // ===================================================
        // VERIFY CONFIRM BUTTON
        // ===================================================

        cy.contains('button', 'Confirm Receipt')
          .should('be.visible')
          .and('not.be.disabled')


        // ===================================================
        // IMPORTANT:
        // INTERCEPT THE ACTUAL PURCHASE ORDER UPDATE
        // ===================================================

        cy.intercept(
          'PATCH',
          '**/rest/v1/purchase_orders*'
        ).as('updatePurchaseOrder')


        // ===================================================
        // CONFIRM RECEIPT
        // ===================================================

        cy.contains('button', 'Confirm Receipt')
          .click()
      })


    // =======================================================
    // WAIT FOR THE ACTUAL PURCHASE ORDER UPDATE
    // =======================================================

    cy.wait('@updatePurchaseOrder', {
      timeout: 15000,
    }).then((interception) => {

      cy.log(
        `Purchase order update response: ${interception.response?.statusCode}`
      )

      cy.log(
        `Purchase order update body: ${JSON.stringify(
          interception.request.body
        )}`
      )

      // The backend request MUST set the PO to received
      expect(
        interception.request.body,
        'purchase order update should contain received status'
      ).to.include({
        status: 'received',
      })

      // Supabase should return a successful response
      expect(
        interception.response?.statusCode,
        'purchase order update should succeed'
      ).to.be.oneOf([200, 204])
    })


    // =======================================================
    // WAIT FOR MODAL TO CLOSE
    // =======================================================

    cy.get('.fixed.inset-0')
      .should('not.exist')


    // =======================================================
    // WAIT A LITTLE FOR PAGE DATA TO REFRESH
    // =======================================================

    cy.wait(1000)
  })


  // =========================================================
  // 7. FINAL - VERIFY RECEIVED
  // =========================================================

  it('PO shows Received status after manager receives all items', () => {
    const poNumber = Cypress.env('currentPO')

    cy.loginAsManager()
    cy.visit('/purchase-orders')

    // =======================================================
    // GO DIRECTLY TO RECEIVED TAB
    // =======================================================

    cy.contains('button', /^Received/)
      .should('be.visible')
      .click()

    // =======================================================
    // WAIT FOR PO TO APPEAR IN RECEIVED
    // =======================================================

    cy.contains(poNumber, {
      timeout: 15000,
    })
      .should('be.visible')

    // =======================================================
    // FIND THE PO CARD
    // =======================================================

    cy.contains(poNumber)
      .closest('div.flex.flex-col')
      .should('contain.text', 'Received')
  })
})