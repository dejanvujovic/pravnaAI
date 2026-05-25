/**
 * Heuristička ekstrakcija metapodataka iz parsiranog teksta dokumenta.
 *
 * Cilj: smanjiti broj polja koje pravnik mora ručno popuniti pri ingest-u
 * crnogorskih propisa iz tipičnog "Katalog propisa" PDF formata.
 *
 * Sve heuristike su namjerno konzervativne — bolje vratiti undefined nego
 * pogrešno popuniti polje, jer korisnik vjerovatno neće primijetiti pogrešno
 * prefilovan dropdown.
 */

import type {
  AnalyzeResponse,
  DocumentType,
  LegalArea,
} from "@rtcg/shared";

const SAMPLE_LEN = 8000;

// ---------------------------------------------------------------------------
// Pismo (jezik) — broji ćirilicu vs latinicu
// ---------------------------------------------------------------------------

function detektujJezik(tekst: string): AnalyzeResponse["jezik"] | undefined {
  const uzorak = tekst.slice(0, SAMPLE_LEN);
  let cirilica = 0;
  let latinica = 0;
  for (const ch of uzorak) {
    const code = ch.charCodeAt(0);
    // Cyrillic Unicode block: 0x0400-0x04FF
    if (code >= 0x0400 && code <= 0x04ff) cirilica++;
    // Latinica (osnovna + crnogorska/srpska proširenja)
    else if (
      (code >= 0x0041 && code <= 0x005a) ||
      (code >= 0x0061 && code <= 0x007a) ||
      "ČĆŽŠĐčćžšđ".includes(ch)
    ) {
      latinica++;
    }
  }
  const ukupno = cirilica + latinica;
  if (ukupno < 100) return undefined;
  const cirProcent = cirilica / ukupno;
  if (cirProcent > 0.85) return "sr-Cyrl";
  if (cirProcent < 0.15) return "sr-Latn";
  return "mixed";
}

// ---------------------------------------------------------------------------
// Tip dokumenta — iz prve "značajne" velike riječi heading-a
// ---------------------------------------------------------------------------

interface TipMatch {
  tip: DocumentType;
  pouzdanost: number;
}

function detektujTip(tekst: string): TipMatch | undefined {
  const uzorak = tekst.slice(0, 3000).toLowerCase();

  // Ugovori — najspecifičniji prvo
  if (/ugovor[a-zšđčćž\s]*o\s+javnoj\s+nabavci/.test(uzorak) ||
      /ugovor[a-zšđčćž\s]*o\s+nabavci/.test(uzorak)) {
    return { tip: "UGOVOR_JAVNA_NABAVKA", pouzdanost: 0.9 };
  }
  if (/ugovor[a-zšđčćž\s]*o\s+radu/.test(uzorak)) {
    return { tip: "UGOVOR_O_RADU", pouzdanost: 0.9 };
  }

  // Sudska praksa / presude
  if (/^\s*presuda\b/im.test(uzorak) || /vrhovni\s+sud|apelacioni\s+sud|osnovni\s+sud/.test(uzorak)) {
    if (/^\s*presuda\b/im.test(uzorak)) return { tip: "PRESUDA", pouzdanost: 0.85 };
    return { tip: "SUDSKA_PRAKSA", pouzdanost: 0.6 };
  }

  // Mišljenje (ministarstva, regulatora itd.)
  if (/^\s*mi[šs]ljenje\b/im.test(uzorak)) {
    return { tip: "MISLJENJE", pouzdanost: 0.75 };
  }

  // Zakon — heading "ZAKON" na samostalnoj liniji
  if (/^\s*zakon\b/im.test(uzorak) || /\bzakon\s+o\s+[a-zšđčćž]/i.test(uzorak)) {
    return { tip: "ZAKON", pouzdanost: 0.9 };
  }

  // Podzakonski akti
  if (/^\s*(uredba|pravilnik|odluka|naredba|uputstvo)\b/im.test(uzorak)) {
    return { tip: "PODZAKONSKI_AKT", pouzdanost: 0.85 };
  }

  // Interni akti RTCG — heuristika po pojavi imena u tekstu (vrlo gruba)
  if (/\brtcg\b/i.test(uzorak) && /\b(statut|pravilnik|akt)\b/i.test(uzorak)) {
    return { tip: "INTERNI_AKT", pouzdanost: 0.5 };
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Naslov — iz heading-a (najčešći obrazac: "ZAKON\n O PARNIČNOM POSTUPKU")
// ---------------------------------------------------------------------------

interface NaslovMatch {
  naslov: string;
  pouzdanost: number;
}

const TIP_GENITIV_MAPA: Record<string, string> = {
  zakona: "Zakon",
  uredbe: "Uredba",
  pravilnika: "Pravilnik",
  odluke: "Odluka",
  naredbe: "Naredba",
  uputstva: "Uputstvo",
};

const TIP_NOMINATIV_MAPA: Record<string, string> = {
  zakon: "Zakon",
  uredba: "Uredba",
  uredbu: "Uredba",
  pravilnik: "Pravilnik",
  odluka: "Odluka",
  odluku: "Odluka",
  naredba: "Naredba",
  uputstvo: "Uputstvo",
};

/**
 * Napomena: unpdf parser sa mergePages:true spaja sve linije u jedan red,
 * pa heuristike rade na "jednoredom" tekstu. Heading "ZAKON O MEDIJIMA"
 * pojavljuje se u tekstu nakon "donijela je ZAKON O MEDIJIMA I. OSNOVNE..."
 * — koristimo te kontekstualne markere.
 */
function detektujNaslov(tekst: string): NaslovMatch | undefined {
  const uzorak = tekst.slice(0, 5000);

  // Obrazac 1 (najpouzdaniji): "donijela je ZAKON O XYZ" gdje XYZ je niz
  // uppercase riječi, a iza dolazi rimski broj, riječ "Član" ili Title-case riječ.
  const donesen = uzorak.match(
    /donijela\s+je\s+(ZAKON|UREDB[AU]|PRAVILNIK|ODLUKU|ODLUKA|NAREDB[AU]|UPUTSTVO)\s+(O\s+(?:[A-ZČĆŽŠĐ]{2,}(?:\s+[A-ZČĆŽŠĐ]{2,}){0,10}))(?=\s+(?:[IVX]+\.?|Član|[A-ZČĆŽŠĐ][a-zčćžšđ]))/,
  );
  if (donesen) {
    const tip = TIP_NOMINATIV_MAPA[donesen[1]!.toLowerCase()] ?? "Zakon";
    return {
      naslov: `${tip} ${donesen[2]!.toLowerCase()}`,
      pouzdanost: 0.95,
    };
  }

  // Obrazac 2: "Prečišćeni tekst Zakona o XYZ obuhvata|izmjenama|..."
  // Pažljivo sa č/ć — to su različiti karakteri.
  const precisceni = uzorak.match(
    /Pre[čćc]i[šs][čćc]eni\s+tekst\s+(Zakona|Uredbe|Pravilnika|Odluke|Naredbe|Uputstva)\s+o\s+(.+?)\s+(?:obuhvata|izmjen|stupa\s+na\s+snagu|\(|,)/i,
  );
  if (precisceni) {
    const tip = TIP_GENITIV_MAPA[precisceni[1]!.toLowerCase()] ?? "Zakon";
    return {
      naslov: `${tip} o ${precisceni[2]!.trim().replace(/\s+/g, " ")}`,
      pouzdanost: 0.85,
    };
  }

  // Obrazac 3: "UKAZ O PROGLAŠENJU ZAKONA O XYZ" — u zaglavlju službenog lista
  const ukaz = uzorak.match(
    /PROGLA[ŠS]ENJU\s+(ZAKONA|UREDBE|PRAVILNIKA|ODLUKE|NAREDBE|UPUTSTVA)\s+(O\s+(?:[A-ZČĆŽŠĐ]{2,}(?:\s+[A-ZČĆŽŠĐ]{2,}){0,10}))(?=\s+(?:\(|[A-ZČĆŽŠĐ][a-zčćžšđ]))/,
  );
  if (ukaz) {
    const tip = TIP_GENITIV_MAPA[ukaz[1]!.toLowerCase()] ?? "Zakon";
    return {
      naslov: `${tip} ${ukaz[2]!.toLowerCase()}`,
      pouzdanost: 0.85,
    };
  }

  // Obrazac 4 (slabiji): samostalno "ZAKON O XYZ" u uppercase, gdje XYZ
  // sadrži najmanje dvije uppercase riječi (da ne hvatamo "ZAKON O TOME").
  const samostalno = uzorak.match(
    /\b(ZAKON|UREDBA|PRAVILNIK|ODLUKA|NAREDBA|UPUTSTVO)\s+(O\s+[A-ZČĆŽŠĐ]{3,}(?:\s+[A-ZČĆŽŠĐ]{3,}){1,8})(?=\s+(?:[IVX]+\.?|Član|[A-ZČĆŽŠĐ][a-zčćžšđ]|\())/,
  );
  if (samostalno) {
    const tip = TIP_NOMINATIV_MAPA[samostalno[1]!.toLowerCase()] ?? "Zakon";
    return {
      naslov: `${tip} ${samostalno[2]!.toLowerCase()}`,
      pouzdanost: 0.7,
    };
  }

  // Obrazac 5: "PRESUDA" / "RJEŠENJE" / "MIŠLJENJE" — uzeti naredni segment
  const presuda = uzorak.match(/\b(PRESUDA|RJE[ŠS]ENJE|MI[ŠS]LJENJE)\s+([^.]{5,200}?)(?=\s+(?:U\s+ime|U\s+IME|Sud|SUD|\())/);
  if (presuda) {
    return {
      naslov: kapitalizujProvi(presuda[1]!.toLowerCase()) + " — " + presuda[2]!.trim(),
      pouzdanost: 0.6,
    };
  }

  return undefined;
}

function kapitalizujProvi(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Datum — prvi "od DD.MM.YYYY" nakon "Sl. list" reference
// ---------------------------------------------------------------------------

function detektujDatum(tekst: string): string | undefined {
  const uzorak = tekst.slice(0, 5000);

  // Tražimo "od DD.MM.YYYY"
  const match = uzorak.match(/\bod\s+(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
  if (!match) return undefined;

  const dan = match[1]!.padStart(2, "0");
  const mjesec = match[2]!.padStart(2, "0");
  const godina = match[3]!;

  // Validacija
  const danBroj = parseInt(dan, 10);
  const mjBroj = parseInt(mjesec, 10);
  const godBroj = parseInt(godina, 10);
  if (danBroj < 1 || danBroj > 31) return undefined;
  if (mjBroj < 1 || mjBroj > 12) return undefined;
  if (godBroj < 1900 || godBroj > 2100) return undefined;

  return `${godina}-${mjesec}-${dan}`;
}

// ---------------------------------------------------------------------------
// Broj službenog lista — pattern "br. NNN/YY"
// ---------------------------------------------------------------------------

function detektujBrojSluzbenogLista(tekst: string): string | undefined {
  const uzorak = tekst.slice(0, 5000);

  // Pattern: "br. 054/24" ili "br. 022/04"
  const match = uzorak.match(/\bbr\.\s*(\d{1,3}\/\d{2,4})\b/);
  if (!match) return undefined;

  return match[1];
}

// ---------------------------------------------------------------------------
// Organ / sud
// ---------------------------------------------------------------------------

function detektujOrganSud(tekst: string, tip?: DocumentType): string | undefined {
  // Za zakone — "Skupština Crne Gore"
  if (tip === "ZAKON" || tip === "PODZAKONSKI_AKT") {
    if (/Skup[šs]tina\s+Crne\s+Gore/i.test(tekst)) {
      return "Skupština Crne Gore";
    }
  }

  // Za presude — tražimo sud iz uvodnih nekoliko linija
  if (tip === "PRESUDA" || tip === "SUDSKA_PRAKSA") {
    const sudMatch = tekst
      .slice(0, 3000)
      .match(/\b(Vrhovni\s+sud|Apelacioni\s+sud|Vi[šs]i\s+sud|Osnovni\s+sud|Privredni\s+sud|Ustavni\s+sud)[^\n.,]*Crne\s+Gore/i);
    if (sudMatch) return sudMatch[0].trim();
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Oblast — keyword matching (najmanje pouzdano)
// ---------------------------------------------------------------------------

const OBLAST_KEYWORDS: Array<{ oblast: LegalArea; rijeci: RegExp[] }> = [
  {
    oblast: "PARNICNI_POSTUPAK",
    rijeci: [/parnični\s+postup/i, /tuž[bi]/i, /tuženi/i, /pripremno\s+ročište/i],
  },
  {
    oblast: "UPRAVNI_POSTUPAK",
    rijeci: [/upravni\s+postup/i, /upravni\s+akt/i, /upravni\s+spor/i],
  },
  {
    oblast: "RADNO_PRAVO",
    rijeci: [/radn[aiyou]\s+odnos/i, /zaposlen/i, /poslodavac/i, /ugovor\s+o\s+radu/i, /otkaz/i],
  },
  {
    oblast: "JAVNE_NABAVKE",
    rijeci: [/javn[aiyou]\s+nabavk/i, /naručilac/i, /ponuđač/i, /tenderska/i],
  },
  {
    oblast: "MEDIJSKO_PRAVO",
    rijeci: [/medij/i, /novinar/i, /audiovizuel/i, /emiter/i, /RTCG/],
  },
  {
    oblast: "OBLIGACIONO",
    rijeci: [/obligacion/i, /naknada\s+štete/i, /ugovorn[aiyou]\s+obavez/i],
  },
  {
    oblast: "KRIVICNO",
    rijeci: [/krivičn[aiyou]\s+djel/i, /optuženi/i, /krivični\s+postup/i],
  },
  {
    oblast: "AUTORSKO",
    rijeci: [/autorsk[aiyou]/i, /srodna\s+prava/i, /intelektualn[aiyou]\s+svojin/i],
  },
];

function detektujOblast(tekst: string): { oblast: LegalArea; pouzdanost: number } | undefined {
  const uzorak = tekst.slice(0, 10000);
  let najbolja: { oblast: LegalArea; brojač: number } | undefined;

  for (const { oblast, rijeci } of OBLAST_KEYWORDS) {
    let brojač = 0;
    for (const re of rijeci) {
      const matchevi = uzorak.match(new RegExp(re.source, re.flags + "g"));
      if (matchevi) brojač += matchevi.length;
    }
    if (brojač > 0 && (!najbolja || brojač > najbolja.brojač)) {
      najbolja = { oblast, brojač };
    }
  }

  if (!najbolja || najbolja.brojač < 3) return undefined;

  // Pouzdanost proporcionalna broju matchova, capped na 0.85
  const pouzdanost = Math.min(0.5 + najbolja.brojač * 0.05, 0.85);
  return { oblast: najbolja.oblast, pouzdanost };
}

// ---------------------------------------------------------------------------
// Glavna funkcija
// ---------------------------------------------------------------------------

export function analyze(tekst: string): AnalyzeResponse {
  const out: AnalyzeResponse = { pouzdanost: {} };
  const conf = out.pouzdanost!;

  const tipMatch = detektujTip(tekst);
  if (tipMatch) {
    out.tip = tipMatch.tip;
    conf.tip = tipMatch.pouzdanost;
  }

  const naslovMatch = detektujNaslov(tekst);
  if (naslovMatch) {
    out.naslov = naslovMatch.naslov;
    conf.naslov = naslovMatch.pouzdanost;
  }

  const datum = detektujDatum(tekst);
  if (datum) {
    out.datum = datum;
    conf.datum = 0.7;
  }

  const broj = detektujBrojSluzbenogLista(tekst);
  if (broj) {
    out.brojSluzbenogLista = broj;
    conf.brojSluzbenogLista = 0.7;
  }

  const organ = detektujOrganSud(tekst, out.tip);
  if (organ) {
    out.organSud = organ;
    conf.organSud = 0.8;
  }

  const oblast = detektujOblast(tekst);
  if (oblast) {
    out.oblast = oblast.oblast;
    conf.oblast = oblast.pouzdanost;
  }

  const jezik = detektujJezik(tekst);
  if (jezik) {
    out.jezik = jezik;
    conf.jezik = 0.95;
  }

  // Status — uvijek VAZECI kao default; ne stavljamo u pouzdanost da UI ne
  // bi pokazao da je auto-detektovano kad zapravo nije.
  out.status = "VAZECI";

  return out;
}
