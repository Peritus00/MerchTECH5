/**
 * Credential PDF rendering using jsPDF.
 *
 * Supports two stock sizes:
 *   laminate_3x4  — 76mm × 102mm (3" × 4" lanyard badge)
 *   cr80          — 85.6mm × 54mm (credit-card size)
 *
 * Both formats include:
 *   - Attendee name
 *   - Access level label (colour strip)
 *   - QR code (public_code)
 *   - Optional photo
 *   - Credential number (bottom left)
 *
 * Batch export: generates a single A4 PDF with 4-up layout.
 */

import { Platform } from 'react-native';
import QRCode from 'qrcode';

export interface CredentialData {
  credential_number: number;
  public_code: string;
  attendee_name: string | null;
  access_level_name: string;
  access_level_color: string;      // hex e.g. '#FF0000'
  photo_data_url?: string | null;  // base64 data URL for photo (optional)
  stock: 'laminate_3x4' | 'cr80';
  event_name: string;
}

// Stock dimensions in mm
const STOCK: Record<string, { w: number; h: number }> = {
  laminate_3x4: { w: 76, h: 102 },
  cr80:         { w: 85.6, h: 54 },
};

async function getJsPDF() {
  if (Platform.OS !== 'web') throw new Error('PDF generation is web-only');
  const mod = await import('jspdf');
  return (mod as any).jsPDF || (mod as any).default?.jsPDF || mod;
}

async function generateQRDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { width: 200, margin: 1, errorCorrectionLevel: 'M' });
}

/**
 * Render a single credential onto a jsPDF document at the given position.
 */
async function renderCredential(
  pdf: any,
  cred: CredentialData,
  xMm: number,
  yMm: number,
): Promise<void> {
  const { w, h } = STOCK[cred.stock];
  const ZONE_STRIP_H = 8;
  const PADDING = 4;

  // Background
  pdf.setFillColor('#FFFFFF');
  pdf.rect(xMm, yMm, w, h, 'F');

  // Colour zone strip (top)
  const col = cred.access_level_color || '#333333';
  pdf.setFillColor(col);
  pdf.rect(xMm, yMm, w, ZONE_STRIP_H, 'F');

  // Access level name on strip
  pdf.setTextColor('#FFFFFF');
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.text(cred.access_level_name.toUpperCase(), xMm + PADDING, yMm + ZONE_STRIP_H - 2);

  // QR code
  const qrDataUrl = await generateQRDataUrl(cred.public_code);
  const qrSize = Math.min(w * 0.45, h * 0.45);
  const qrX = cred.stock === 'laminate_3x4'
    ? xMm + (w - qrSize) / 2              // centred for laminate
    : xMm + w - qrSize - PADDING;          // right-aligned for CR80
  const qrY = yMm + ZONE_STRIP_H + PADDING;
  pdf.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

  // Photo (left side for laminate; skip for CR80 if no room)
  if (cred.photo_data_url && cred.stock === 'laminate_3x4') {
    const photoSize = 24;
    const photoX = xMm + PADDING;
    const photoY = yMm + ZONE_STRIP_H + PADDING;
    try {
      pdf.addImage(cred.photo_data_url, 'JPEG', photoX, photoY, photoSize, photoSize);
    } catch (_) { /* ignore missing photo */ }
  }

  // Attendee name
  pdf.setTextColor('#000000');
  pdf.setFontSize(cred.stock === 'laminate_3x4' ? 10 : 8);
  pdf.setFont('helvetica', 'bold');
  const nameY = yMm + ZONE_STRIP_H + qrSize + PADDING * 2 + 4;
  pdf.text(
    (cred.attendee_name || 'Guest').substring(0, 30),
    xMm + w / 2,
    nameY,
    { align: 'center', maxWidth: w - PADDING * 2 }
  );

  // Event name (small)
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor('#666666');
  pdf.text(
    cred.event_name.substring(0, 40),
    xMm + w / 2,
    nameY + 5,
    { align: 'center', maxWidth: w - PADDING * 2 }
  );

  // Credential number (bottom left)
  pdf.setFontSize(6);
  pdf.setTextColor('#AAAAAA');
  pdf.text(`#${String(cred.credential_number).padStart(5, '0')}`, xMm + PADDING, yMm + h - 2);

  // Border
  pdf.setDrawColor('#DDDDDD');
  pdf.setLineWidth(0.3);
  pdf.rect(xMm, yMm, w, h, 'S');
}

/**
 * Generate a single credential PDF (one per page, stock-sized).
 */
export async function generateSingleCredentialPDF(cred: CredentialData): Promise<Blob> {
  const JPDF = await getJsPDF();
  const { w, h } = STOCK[cred.stock];
  const pdf = new JPDF({ orientation: h > w ? 'portrait' : 'landscape', unit: 'mm', format: [w, h] });
  await renderCredential(pdf, cred, 0, 0);
  return pdf.output('blob');
}

/**
 * Generate an A4 4-up batch sheet (2×2 grid, trimming guides).
 * Ideal for printing multiple credentials on a single sheet.
 */
export async function generateBatchCredentialPDF(
  credentials: CredentialData[],
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const JPDF = await getJsPDF();

  // A4: 210mm × 297mm
  const PAGE_W = 210;
  const PAGE_H = 297;
  const MARGIN = 10;
  const GAP = 5;

  const stock = credentials[0]?.stock ?? 'laminate_3x4';
  const { w: cW, h: cH } = STOCK[stock];

  const COLS = 2;
  const ROWS = 4;
  const PER_PAGE = COLS * ROWS;

  const pdf = new JPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  for (let i = 0; i < credentials.length; i++) {
    const posOnPage = i % PER_PAGE;
    if (posOnPage === 0 && i > 0) pdf.addPage();

    const col = posOnPage % COLS;
    const row = Math.floor(posOnPage / COLS);
    const xMm = MARGIN + col * (cW + GAP);
    const yMm = MARGIN + row * (cH + GAP);

    await renderCredential(pdf, credentials[i], xMm, yMm);

    // Trim marks (hairline crosses)
    pdf.setDrawColor('#CCCCCC');
    pdf.setLineWidth(0.1);
    const marks = [
      [xMm, yMm - 3, xMm, yMm],
      [xMm - 3, yMm, xMm, yMm],
      [xMm + cW, yMm - 3, xMm + cW, yMm],
      [xMm + cW, yMm, xMm + cW + 3, yMm],
      [xMm, yMm + cH, xMm, yMm + cH + 3],
      [xMm - 3, yMm + cH, xMm, yMm + cH],
      [xMm + cW, yMm + cH, xMm + cW, yMm + cH + 3],
      [xMm + cW, yMm + cH, xMm + cW + 3, yMm + cH],
    ];
    for (const [x1, y1, x2, y2] of marks) {
      pdf.line(x1, y1, x2, y2);
    }

    if (onProgress) onProgress(Math.round(((i + 1) / credentials.length) * 100));
  }

  return pdf.output('blob');
}

/** Trigger a browser download of a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
