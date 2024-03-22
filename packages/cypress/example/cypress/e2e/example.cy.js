/// <reference types="cypress" />

it("basic test", () => {
  cy.visit("http://localhost:3000/");

  cy.get(".App p").contains("Edit src/App.tsx and save to reload.");
});
