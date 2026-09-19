/**
 * Input Validation and Cleaning Utilities
 */

export const ALLOWED_DOMAINS = [
  "delulucoders",
  "mangalore.edu",
  "campus.edu",
  "student.in",
  "college.edu",
  "nitk.edu.in",
  "mit.edu",
  "staloysius.edu.in",
  "manipal.edu"
];

/**
 * Sanitizes a string to prevent XSS (strips HTML tags and script elements) and trims it.
 */
export function sanitizeString(input: string): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, "") // Remove <script> blocks
    .replace(/<[^>]*>/g, "") // Strip HTML tags
    .replace(/on\w+\s*=\s*"[^"]*"/gi, "") // Remove inline event handlers like onerror="..."
    .replace(/on\w+\s*=\s*'[^']*'/gi, "")
    .replace(/on\w+\s*=\s*javascript:[^\s>]*/gi, "")
    .trim();
}

/**
 * Recursively scans and sanitizes all string properties inside an object or array.
 */
export function sanitizeData<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === "string") {
    return sanitizeString(data) as any;
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item)) as any;
  }

  if (typeof data === "object") {
    const cleaned: any = {};
    for (const [key, val] of Object.entries(data)) {
      // Keep binary/base64 strings or images safe, but sanitize standard descriptions/names/comments
      if (typeof val === "string" && (key.includes("Url") || key.includes("Image") || key.startsWith("data:"))) {
        cleaned[key] = val.trim(); // Do not strip HTML tags from image/data fields, just trim
      } else {
        cleaned[key] = sanitizeData(val);
      }
    }
    return cleaned;
  }

  return data;
}

/**
 * Validates whether an email conforms to a clean format and is from an approved student domain.
 */
export function isValidStudentEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const sanitized = email.trim().toLowerCase();
  
  // Basic email pattern regex
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(sanitized)) return false;

  const parts = sanitized.split("@");
  if (parts.length !== 2) return false;
  const domain = parts[1];

  // Match domain or any subdomain within allowed student domains
  return ALLOWED_DOMAINS.some(allowed => 
    domain === allowed || domain.endsWith("." + allowed)
  );
}

/**
 * Validates whether a phone number matches standard patterns (10 to 14 digits, optional plus/whitespace).
 */
export function isValidPhoneNumber(phone: string): boolean {
  if (!phone || typeof phone !== "string") return false;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 13;
}

/**
 * Clean and normalize names to prevent injection and format nicely.
 */
export function cleanFullName(name: string): string {
  if (!name || typeof name !== "string") return "";
  return sanitizeString(name)
    .replace(/[^a-zA-Z\s.-]/g, "") // keep only alphabets, spaces, dots, dashes
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Validates whether a password is strong:
 * - At least 8 characters long
 * - At least one capital (uppercase) letter
 * - At least one special character
 * - At least one number
 */
export function validatePasswordStrength(password: string): { isValid: boolean; message: string } {
  if (!password) {
    return { isValid: false, message: "Password is required." };
  }
  if (password.length < 8) {
    return { isValid: false, message: "Password must be at least 8 characters long." };
  }
  if (!/[A-Z]/.test(password)) {
    return { isValid: false, message: "Password must contain at least one uppercase (capital) letter." };
  }
  if (!/[0-9]/.test(password)) {
    return { isValid: false, message: "Password must contain at least one number." };
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    return { isValid: false, message: "Password must contain at least one special character." };
  }
  return { isValid: true, message: "" };
}
