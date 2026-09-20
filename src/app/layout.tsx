import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import './report.css';

export const metadata: Metadata = {
  title: 'S.C.A.L.E. Strategic Evaluator',
  description:
    'Turn a 75-word idea into an evidence-backed strategic thesis: research, customer analysis, value-chain mapping, innovation classification and a six-factor evaluation.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="visually-hidden">
          Skip to main content
        </a>
        <header className="site-header no-print">
          <div className="site-header__inner">
            <Link href="/" className="wordmark">
              S.C.A.L.E. <span>STRATEGIC EVALUATOR</span>
            </Link>
            <nav aria-label="Primary">
              <Link href="/">New evaluation</Link>
              <Link href="/workspace">Workspace</Link>
            </nav>
          </div>
        </header>
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
