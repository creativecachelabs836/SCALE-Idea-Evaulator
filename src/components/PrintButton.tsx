'use client';

/** Browser-native print, which uses the same stylesheet as the PDF export. */
export function PrintButton() {
  return (
    <button type="button" className="button" onClick={() => window.print()}>
      Print
    </button>
  );
}
