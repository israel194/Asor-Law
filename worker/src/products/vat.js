/**
 * Israeli VAT — single source of truth.
 * Kept in its own module to avoid circular imports between product files
 * and the product registry (products/index.js).
 */

export const VAT_RATE = 0.18;

export function withVat(priceBeforeVat) {
    return Math.round(priceBeforeVat * (1 + VAT_RATE) * 100) / 100;
}
