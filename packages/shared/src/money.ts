import { z } from "zod";

/** A whole number of millimes (1 TND = 1000 millimes). */
export const millimes = z.number().int().refine(Number.isSafeInteger, "Too large");
export const positiveMillimes = millimes.refine((v) => v > 0, "Must be more than 0");
export const notNegativeMillimes = millimes.refine((v) => v >= 0, "Can't be negative");
