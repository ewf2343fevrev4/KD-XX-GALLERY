export const TIP_PRODUCT_SKU = 'KDXX-TIP-2K';

export function isFreeShippingItem(item) {
  return Boolean(item?.freeShipping || item?.isDigital || item?.sku === TIP_PRODUCT_SKU);
}

export function isTaxExemptItem(item) {
  return Boolean(item?.taxExempt || item?.isDigital || item?.sku === TIP_PRODUCT_SKU);
}

export function getFixedUnitVND(item) {
  const fixed = Number(item?.fixedAmountVND || 0);
  if (fixed > 0) return fixed;
  if (item?.sku === TIP_PRODUCT_SKU) return 2000;
  return 0;
}

export function formatProductPrice(product, quantity = 1) {
  const fixedVND = getFixedUnitVND(product);
  if (fixedVND > 0) {
    return `${Math.round(fixedVND * quantity).toLocaleString('vi-VN')} VND`;
  }
  const usd = (Number(product?.price || 0)) * quantity;
  return `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
