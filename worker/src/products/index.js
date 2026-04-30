/**
 * Product registry.
 *
 * Each product exports:
 *   - id           — stable slug (matches the URL under /digital/<id>/)
 *   - name         — display name (Hebrew)
 *   - priceIls     — price in shekels (incl. VAT)
 *   - formatOfficeEmail(order) → { subject, html, text }
 *   - generateCustomerDeliverable(order, env) → Promise<{ filename, content, contentType }>
 *       (built per product, separately. May throw NotImplemented until ready.)
 */

import * as rentalAgreement from "./rental-agreement.js";

const PRODUCTS = {
    [rentalAgreement.id]: rentalAgreement,
};

export function getProduct(id) {
    const p = PRODUCTS[id];
    if (!p) throw new Error(`Unknown product: ${id}`);
    return p;
}
