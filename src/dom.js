/* Uchwyty do DOM-u trzymane w jednym miejscu. */
export const $ = s => document.querySelector(s);
export const out = $("#out");
export const octx = out.getContext("2d");
