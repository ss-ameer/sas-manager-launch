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

  while (num > 0) {
    const chunk = num % 1000;
    if (chunk !== 0) {
      const chunkWords = convertChunk(chunk);
      const scale = SCALES[scaleIndex];
      words = chunkWords + (scale ? ' ' + scale : '') + (words ? ' ' + words : '');
    }
    num = Math.floor(num / 1000);
    scaleIndex++;
  }

  return words.trim();
}

export interface CurrencySubunitConfig {
  unit: string;
  subunit: string;
}

const CURRENCY_MAP: Record<string, CurrencySubunitConfig> = {
  AED: { unit: 'Dirhams', subunit: 'Fils' },
  USD: { unit: 'Dollars', subunit: 'Cents' },
  EUR: { unit: 'Euros', subunit: 'Cents' },
  GBP: { unit: 'Pounds', subunit: 'Pence' },
  SAR: { unit: 'Riyals', subunit: 'Halalas' },
  QAR: { unit: 'Riyals', subunit: 'Dirhams' },
  BHD: { unit: 'Dinars', subunit: 'Fils' },
  OMR: { unit: 'Rials', subunit: 'Baisa' },
  KWD: { unit: 'Dinars', subunit: 'Fils' },
  INR: { unit: 'Rupees', subunit: 'Paise' }
};

export function formatAmountInWords(
  amount: number | string | null | undefined,
  currencyCode: string = 'AED'
): string {
  if (amount === null || amount === undefined) {
    return 'Zero Only';
  }

  const numAmount = typeof amount === 'number' ? amount : parseFloat(String(amount));
  if (isNaN(numAmount)) {
    return 'Zero Only';
  }

  const cleanCurrency = (currencyCode || 'AED').toUpperCase().trim();
  const config = CURRENCY_MAP[cleanCurrency] || {
    unit: cleanCurrency,
    subunit: 'Cents'
  };

  const rounded = Math.round((Math.abs(numAmount) + Number.EPSILON) * 100) / 100;
  const wholePart = Math.floor(rounded);
  const decimalPart = Math.round((rounded - wholePart) * 100);

  const wholeWords = integerToWords(wholePart);

  let result = '';
  if (decimalPart > 0) {
    const decimalWords = integerToWords(decimalPart);
    result = `${wholeWords} ${cleanCurrency} and ${decimalWords} ${config.subunit} Only`;
  } else {
    result = `${wholeWords} ${cleanCurrency} Only`;
  }

  return result;
}
