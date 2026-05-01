/**
 * Product registry.
 *
 * Each product exports:
 *   - id              — stable slug (matches the URL under /digital/<id>/)
 *   - name            — display name (Hebrew)
 *   - priceIls        — price in shekels (incl. VAT)
 *   - requiredFields  — array of payload keys that must be present (validated by API)
 *   - formatOfficeEmail(order)   → { subject, html, text }
 *   - formatCustomerEmail(order) → { subject, html, text }
 *
 * Type A products additionally export:
 *   - generateCustomerDeliverable(order, env) → Promise<{ filename, content, contentType }>
 *
 * Type B products (digital intake → attorney handles the work) skip the
 * deliverable function — the customer just gets a confirmation email.
 */

import * as rentalAgreement from "./rental-agreement.js";
import * as cautionaryNote from "./cautionary-note.js";
import * as mortgageRegistration from "./mortgage-registration.js";
import * as saleRegistration from "./sale-registration.js";

const PRODUCTS = {
    [rentalAgreement.id]: rentalAgreement,
    [cautionaryNote.id]: cautionaryNote,
    [mortgageRegistration.id]: mortgageRegistration,
    [saleRegistration.id]: saleRegistration,
};

export function getProduct(id) {
    const p = PRODUCTS[id];
    if (!p) throw new Error(`Unknown product: ${id}`);
    return p;
}

export function listProducts() {
    return Object.values(PRODUCTS).map(p => ({
        id: p.id,
        name: p.name,
        priceIls: p.priceIls,
    }));
}
