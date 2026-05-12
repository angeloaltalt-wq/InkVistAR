/**
 * validators.js
 * Centralized sanitization and validation utility functions.
 * Ensures all human-entered data is safe before hitting the backend.
 */

export const sanitizeText = (text) => {
  if (!text) return '';
  // Convert to string and trim
  let sanitized = String(text).trim();
  // Basic XSS prevention: remove <script> tags or html characters if strict
  // For standard text inputs, stripping <> is usually safe.
  sanitized = sanitized.replace(/[<>]/g, '');
  return sanitized;
};

export const sanitizeEmail = (email) => {
  if (!email) return '';
  return String(email).trim().toLowerCase();
};

export const isValidEmail = (email) => {
  const sanitized = sanitizeEmail(email);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(sanitized);
};

export const sanitizePhone = (phone) => {
  if (!phone) return '';
  // Remove anything that isn't a digit, plus, or space
  let sanitized = String(phone).replace(/[^\d+\s-]/g, '').trim();
  // Strip leading zeros from the local number portion
  sanitized = sanitized.replace(/^0+/, '');
  return sanitized;
};

export const isValidPhone = (phone) => {
  const sanitized = sanitizePhone(phone);
  if (!sanitized) return true; // Phone is optional in some contexts
  // For PH numbers (no +prefix), must be 10 digits starting with 9
  const digitsOnly = sanitized.replace(/\D/g, '');
  if (digitsOnly.length === 10 && digitsOnly.startsWith('9')) return true;
  // For international format (+63XXXXXXXXXX)
  if (sanitized.startsWith('+63')) {
    const local = sanitized.replace('+63', '').replace(/\D/g, '');
    return local.length === 10 && local.startsWith('9');
  }
  // Generic fallback for other country codes
  return digitsOnly.length >= 7 && digitsOnly.length <= 15;
};

export const sanitizeNumeric = (val, allowDecimal = false) => {
  if (val === null || val === undefined || val === '') return '';
  let str = String(val).trim();
  if (allowDecimal) {
    str = str.replace(/[^\d.]/g, ''); // Keep only digits and decimal
    // Ensure only one decimal point
    const parts = str.split('.');
    if (parts.length > 2) {
      str = parts[0] + '.' + parts.slice(1).join('');
    }
    return str;
  } else {
    return str.replace(/[^\d]/g, ''); // Keep only digits
  }
};
