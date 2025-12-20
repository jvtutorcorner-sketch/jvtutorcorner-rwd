// Shared PDF.js utility to avoid conflicts between components
let pdfLibPromise: Promise<any> | null = null;
let pdfLib: any = null;
let pdfLibError: Error | null = null;

export async function getPdfLib(): Promise<any> {
  if (pdfLib) {
    return pdfLib;
  }

  if (pdfLibError) {
    throw pdfLibError;
  }

  if (pdfLibPromise) {
    return pdfLibPromise;
  }

  pdfLibPromise = (async () => {
    try {
      // Import only what we need to avoid initialization issues
      const lib = await import('pdfjs-dist');

      // Don't configure worker at all for now
      pdfLib = lib;
      return lib;
    } catch (e) {
      console.error('Failed to load PDF.js library', e);
      pdfLibError = new Error(`PDF.js loading failed: ${e instanceof Error ? e.message : String(e)}`);
      // Try one more time with a delay
      await new Promise(resolve => setTimeout(resolve, 100));
      try {
        const retryLib = await import('pdfjs-dist');
        pdfLib = retryLib;
        pdfLibError = null; // Clear error on success
        return retryLib;
      } catch (retryError) {
        console.error('Retry also failed', retryError);
        throw pdfLibError;
      }
    }
  })();

  return pdfLibPromise;
}

export function isPdfSupported(): boolean {
  return pdfLibError === null && pdfLib !== null;
}