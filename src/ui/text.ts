/** "45 h" stays together when a line wraps: a number on one line and its unit on the next reads badly. */
export const keepUnits = (text: string) => text.replace(/(\d) h\b/g, '$1\u00a0h');
