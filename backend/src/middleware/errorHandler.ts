/**
 * Globalni error handler — zadnja linija odbrane prije nego što sirov
 * stack trace ode klijentu. Mapira poznate greške (multer, syntax error
 * u JSON-u) u smislene HTTP statuse; ostalo logujemo i vraćamo 500.
 */

import type { ErrorRequestHandler } from "express";
import multer from "multer";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ greska: "Fajl premašuje dozvoljeni limit (50 MB)." });
      return;
    }
    res.status(400).json({ greska: `Upload greška: ${err.message}` });
    return;
  }

  if (err instanceof SyntaxError && "body" in (err as object)) {
    res.status(400).json({ greska: "Neispravan JSON u tijelu zahtjeva." });
    return;
  }

  console.error("[server] neuhvaćena greška:", err);
  res.status(500).json({ greska: "Neočekivana greška servera." });
};
