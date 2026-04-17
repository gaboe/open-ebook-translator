/**
 * Safely access environment variables in both Node.js and Browser environments.
 */
export function getEnv(key: string): string | undefined {
  // Check for Node.js process.env
  if (typeof process !== "undefined" && process.env) {
    return process.env[key];
  }

  // Check for Vite import.meta.env (needs VITE_ prefix usually, but check for safety)
  try {
    // @ts-ignore
    if (import.meta && import.meta.env) {
      // @ts-ignore
      return import.meta.env[key] || import.meta.env[`VITE_${key}`];
    }
  } catch {
    // Ignore errors accessing import.meta
  }

  return undefined;
}
