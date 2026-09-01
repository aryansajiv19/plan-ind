import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class lists, letting later classes win over earlier ones.
 *
 * Added with the kokonutui registry components, which all expect it. Nothing
 * hand-written in this codebase needs it — our own components compose class
 * names with template literals and arrays — so treat a `cn()` import as a
 * marker that the file came from a registry.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
