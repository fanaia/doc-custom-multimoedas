"use strict";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function isValidEmail(value) {
  return EMAIL.test(String(value || "").trim());
}

function splitEmails(value) {
  if (Array.isArray(value)) return value.flatMap(splitEmails);
  return String(value || "").split(/[;,\s]+/).map((item) => item.trim()).filter(Boolean);
}

function normalizeRecipients({ to = [], cc = [], bcc = [] } = {}) {
  const seen = new Set();
  const invalid = [];
  const normalizeGroup = (input) => {
    const output = [];
    for (const raw of splitEmails(input)) {
      const email = raw.toLowerCase();
      if (!EMAIL.test(email)) {
        invalid.push(raw);
        continue;
      }
      if (seen.has(email)) continue;
      seen.add(email);
      output.push(email);
    }
    return output;
  };
  return {
    to: normalizeGroup(to),
    cc: normalizeGroup(cc),
    bcc: normalizeGroup(bcc),
    invalid,
  };
}

function withInternalCopies(recipients, internalRecipients = []) {
  const merged = normalizeRecipients({
    to: recipients?.to || [],
    cc: [recipients?.cc || [], internalRecipients],
    bcc: recipients?.bcc || [],
  });
  return { ...merged, invalid: [...new Set([...(recipients?.invalid || []), ...merged.invalid])] };
}

module.exports = { isValidEmail, normalizeRecipients, splitEmails, withInternalCopies };
