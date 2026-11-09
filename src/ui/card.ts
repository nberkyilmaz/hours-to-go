/**
 * A picture of a milestone to share (D61). It's drawn here in the browser, so nothing is uploaded and nobody but the
 * pilot decides where it goes.
 */
import { t } from '../i18n';
import { today } from '../model/entry';
import { saveFile } from './export';

export interface CardFacts {
  headline: string;
  detail: string;
  /** Draws a ring when there's a share of the way to show. */
  percent: number | null;
}

const SIZE = 1080;
const MARGIN = 96;
const FONT = 'B612, system-ui, sans-serif';
const NAVY = '#111827';
const CYAN = '#22d3ee';
const WHITE = '#ffffff';
const GREY = '#aeb6c2';

/** As many words as fit on each line. */
export function wrapped(text: string, width: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const longer = line ? `${line} ${word}` : word;
    if (line && measure(longer) > width) {
      lines.push(line);
      line = word;
    } else line = longer;
  }
  if (line) lines.push(line);
  return lines;
}

function ring(c: CanvasRenderingContext2D, percent: number): void {
  const x = SIZE / 2;
  const y = 340;
  const radius = 170;
  c.lineWidth = 34;
  c.lineCap = 'round';
  c.strokeStyle = 'rgba(255,255,255,.14)';
  c.beginPath();
  c.arc(x, y, radius, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = CYAN;
  c.beginPath();
  c.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * percent) / 100);
  c.stroke();
  c.fillStyle = WHITE;
  c.font = `700 104px ${FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(t('{n}%', { n: percent }), x, y);
}

/** The picture, as a PNG. Waits for the app's font, which a canvas won't load by itself. */
export async function drawCard(facts: CardFacts): Promise<Blob> {
  await Promise.all([document.fonts?.load('700 80px B612'), document.fonts?.load('400 44px B612')]);
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('No canvas here.');
  c.fillStyle = NAVY;
  c.fillRect(0, 0, SIZE, SIZE);
  c.fillStyle = CYAN;
  c.fillRect(0, SIZE - 16, SIZE, 16);

  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.fillStyle = CYAN;
  c.font = `700 40px ${FONT}`;
  c.fillText(t('Hours to Go').toUpperCase(), MARGIN, 128);

  if (facts.percent !== null) ring(c, facts.percent);

  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  c.fillStyle = WHITE;
  c.font = `700 76px ${FONT}`;
  const lines = wrapped(facts.headline, SIZE - MARGIN * 2, (s) => c.measureText(s).width);
  // With no ring the words have the middle of the card to themselves.
  let y = facts.percent !== null ? 680 : 480 - (lines.length - 1) * 46;
  for (const line of lines) {
    c.fillText(line, SIZE / 2, y);
    y += 92;
  }
  c.fillStyle = GREY;
  c.font = `400 44px ${FONT}`;
  c.fillText(facts.detail, SIZE / 2, y + 10);

  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No picture.'))), 'image/png'));
}

/** Through the phone's share sheet where there is one, or else as a download. */
export async function shareCard(facts: CardFacts): Promise<void> {
  const blob = await drawCard(facts);
  const name = `hours-to-go-${today()}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: facts.headline });
    } catch (err) {
      // Closing the share sheet isn't a failure.
      if (!(err instanceof DOMException && err.name === 'AbortError')) throw err;
    }
    return;
  }
  saveFile(blob, name);
}
