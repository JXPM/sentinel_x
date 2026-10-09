// Écran LCD 16×2 du boîtier : même nettoyage que le serveur (app/settings.py, lcd_text).
export const LCD_COLS = 16;
export const LCD_MAX = 32;

/** Sans accents (absents de la police du LCD), ASCII imprimable, 32 caractères au plus. */
export const lcdSafe = (text: string): string =>
  text
    .replace(/[\u2013\u2014]/g, '-').replace(/\u2019/g, "'").replace(/\u00a0/g, ' ')
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .trim()
    .slice(0, LCD_MAX);

/** Découpe sur deux lignes de 16 caractères, comme le firmware. */
export const lcdLines = (text: string): [string, string] => [text.slice(0, LCD_COLS), text.slice(LCD_COLS, LCD_MAX)];
