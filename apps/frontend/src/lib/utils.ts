import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const isZohoDeskEnabled = () => process.env.ZOHO_DESK_ENABLED === 'true';
