/**
 * Utility to convert numerical currency amounts into English words
 * for formal commercial quotations, invoices, and purchase orders.
 */

const ONES: string[] = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'
];

const TENS: string[] = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
];

const SCALES: string[] = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];

function convertChunk(num: number): string {
  let words = '';
  if (num >= 100) {
    words += ONES[Math.floor(num / 100)] + ' Hundred ';
    num %= 100;
  }
  if (num >= 20) {
    words += TENS[Math.floor(num / 10)] + (num % 10 !== 0 ? '-' + ONES[num % 10] : '') + ' ';
  } else if (num > 0) {
    words += ONES[num] + ' ';
  }
  return words.trim();
}

export function integerToWords(num: number): string {
  if (num === 0) return 'Zero';
  if (num < 0) return 'Minus ' + integerToWords(Math.abs(num));

  let words = '';
  let scaleIndex = 0;

  let current = Math.floor(num);
  while (current > 0) {
    const chunk = current % 1000;
    if (chunk !== 0) {
      const chunkWords = convertChunk(chunk);
      const scale = SCALES[scaleIndex];
      words = chunkWords + (scale ? ' ' + scale : '') + (words ? ' ' + words : '');
    }
    current = Math.floor(current / 1000);
    scaleIndex++;
  }

  return words.trim();
}

const SUBUNIT_MAP: Record<string, string> = {
  AED: 'Fils',
  USD: 'Cents',
  EUR: 'Cents',
  GBP: 'Pence',
  SAR: 'Halalas',
  QAR: 'Dirhams',
  BHD: 'Fils',
  OMR: 'Baisa',
  KWD: 'Fils',
  INR: 'Paise'
};

/**
 * Converts numerical currency amount into words without "Say" or currency prefixes,
 * spelling out subunits (Fils / Cents) in words:
 * Examples:
 * - 1,176.24 (AED) -> "One Thousand One Hundred Seventy-Six and Twenty-Four Fils Only"
 * - 1,200.00 (AED) -> "One Thousand Two Hundred Only"
 * - 5,462.50 (USD) -> "Five Thousand Four Hundred Sixty-Two and Fifty Cents Only"
 * - 0 -> "Zero Only"
 */
export function amountToWords(
  amount: number | string | null | undefined,
  currency: string = 'AED'
): string {
  if (amount === null || amount === undefined) {
    return 'Zero Only';
  }

  const numAmount =
    typeof amount === 'number'
      ? amount
      : parseFloat(String(amount).replace(/[^0-9.-]+/g, ''));

  if (!Number.isFinite(numAmount) || numAmount === 0) {
    return 'Zero Only';
  }

  const cleanCurrency = (currency || 'AED').toUpperCase().trim();
  const subunit = SUBUNIT_MAP[cleanCurrency] || 'Cents';

  const isNegative = numAmount < 0;
  // Convert to integer subunits (fils/cents) with epsilon guard to eliminate IEEE-754 float drift
  const totalSubunits = Math.round(Math.abs(numAmount) * 100 + 1e-6);
  if (totalSubunits === 0) {
    return 'Zero Only';
  }

  const wholePart = Math.floor(totalSubunits / 100);
  const decimalPart = totalSubunits % 100;

  const prefix = isNegative ? 'Minus ' : '';
  const wholeWords = integerToWords(wholePart);

  if (decimalPart > 0) {
    const decimalWords = integerToWords(decimalPart);
    return `${prefix}${wholeWords} and ${decimalWords} ${subunit} Only`;
  }

  return `${prefix}${wholeWords} Only`;
}

export function amountToWordsAED(
  amount: number | string | null | undefined,
  currency: string = 'AED'
): string {
  return amountToWords(amount, currency);
}

export function amountInWordsAED(
  amount: number | string | null | undefined,
  currency: string = 'AED'
): string {
  return amountToWords(amount, currency);
}

export function formatAmountInWords(
  amount: number | string | null | undefined,
  currencyCode: string = 'AED'
): string {
  return amountToWords(amount, currencyCode);
}

