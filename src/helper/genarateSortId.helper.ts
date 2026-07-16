import { customAlphabet } from "nanoid";

const cleanAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";

/**
 * Generate custom id with nanoid
 * @param length - number of characters in the id, default is 10
 * @returns a string that avoids confusing characters like 0, O, I, l
 */
export const generateCustomId = (length: number = 10): string => {
  const generator = customAlphabet(cleanAlphabet, length);
    return generator(); 
};