import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'S.C.A.L.E. Strategic Evaluator',
  description:
    'Turns a 75-word description of an idea into an evidence-backed strategic thesis.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="visually-hidden">
          Skip to main content
        </a>
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
