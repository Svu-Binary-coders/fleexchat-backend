import { CookieOptions } from "express";

const baseCookieOptions: Omit<CookieOptions, "maxAge"> = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/",
};

export const getCookieOptions = (maxAge: number): CookieOptions => {
  return {
    ...baseCookieOptions,
    maxAge,
    signed: true,
  };
};
