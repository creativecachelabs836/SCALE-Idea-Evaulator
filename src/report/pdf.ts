import 'server-only';
import { chromium, type Browser } from 'playwright-core';
import fs from 'node:fs';
import { config } from '@/lib/config';

/**
 * PDF generation (FR-12, AC-09).
 *
 * The PDF is produced by printing the same report route the user previews, so
 * layout, pagination, typography and live links are identical by construction.
 * The model is never asked to lay out a page (spec section 7).
 *
 * The browser is launched once and reused; launching per request costs roughly
 * a second and is the difference between hitting and missing the 15s target.
 */

let browserPromise: Promise<Browser> | null = null;

const CHROMIUM_CANDIDATES = [
  '/opt/pw-browsers/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
];

function executablePath(): string | undefined {
  if (config.chromiumPath) return config.chromiumPath;
  return CHROMIUM_CANDIDATES.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return undefined;
    }
  });
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        executablePath: executablePath(),
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
      })
      .catch((error) => {
        // Do not cache a failed launch, or every later request inherits it.
        browserPromise = null;
        throw error;
      });
  }
  return browserPromise;
}

export class PdfUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfUnavailableError';
  }
}

export interface RenderPdfOptions {
  /** Absolute URL of the report route, including `?print=1`. */
  url: string;
  /** Forwarded so the headless browser resolves the same tenant session. */
  cookieHeader?: string;
  footerText: string;
}

export async function renderReportPdf(options: RenderPdfOptions): Promise<Buffer> {
  let browser: Browser;
  try {
    browser = await getBrowser();
  } catch (error) {
    throw new PdfUnavailableError(
      `Could not start the PDF renderer. Install Chromium or set SCALE_CHROMIUM_PATH. (${
        error instanceof Error ? error.message : String(error)
      })`,
    );
  }

  const context = await browser.newContext({
    // Letter at 96dpi, so the preview layout maps 1:1 onto the printed sheet.
    viewport: { width: 816, height: 1056 },
    deviceScaleFactor: 2,
    extraHTTPHeaders: options.cookieHeader ? { cookie: options.cookieHeader } : undefined,
  });

  try {
    const page = await context.newPage();
    const response = await page.goto(options.url, {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });

    if (!response || !response.ok()) {
      throw new PdfUnavailableError(
        `The report page returned ${response?.status() ?? 'no response'} to the renderer.`,
      );
    }

    // Web fonts must be resolved before layout is measured, or pagination
    // shifts between preview and export.
    await page.evaluate(() => document.fonts.ready);

    return await page.pdf({
      format: 'Letter',
      printBackground: true,
      preferCSSPageSize: true,
      // Margins live in the page CSS so the running footer sits inside the sheet.
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      displayHeaderFooter: false,
      tagged: true,
    });
  } finally {
    await context.close();
  }
}
