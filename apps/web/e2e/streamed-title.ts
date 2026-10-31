import type { Page } from '@playwright/test';

// #353. Next streams a page's metadata (its <title>) in a row of the response to
// `router.refresh()` that comes after the body rows (more rows can follow it). The page shows its
// new heading while the title is still on its way, and in between the document has no <title>. In
// CI that window is sometimes open when the next line runs, so a test that checks the page right
// after a refresh has to wait for the title first. This helper holds the title row back to open the window on purpose, so a spec can
// prove that, and what it waits for, without relying on timing.

interface HoldWindow {
  __releaseTitle?: () => void;
}

/**
 * Holds back the title row of every refresh response (`?_rsc=`) the page asks for from now on,
 * until `release()`. Call it before `page.goto`. Only that row is held; the rows after it
 * arrive as they would, so the page renders its new body (the new language, the new workspace
 * name in the sidebar) with no `<title>`.
 */
export async function holdBackPageTitle(page: Page): Promise<{ release: () => Promise<void> }> {
  await page.addInitScript(() => {
    const real = window.fetch.bind(window);
    let open!: () => void;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    (window as unknown as HoldWindow).__releaseTitle = open;
    window.fetch = async (input, init) => {
      const response = await real(input, init);
      const url = input instanceof Request ? input.url : String(input);
      if (!url.includes('_rsc=')) return response;
      const text = await response.text();
      // The row with the <title> element: `d:[["$","title","0",{"children":"Sign in"}]]`.
      const at = text.search(/^[0-9a-f]+:\[\["\$","title"/m);
      if (at < 0) return new Response(text, response);
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          const end = text.indexOf('\n', at);
          const after = end < 0 ? text.length : end + 1;
          controller.enqueue(encoder.encode(text.slice(0, at) + text.slice(after)));
          await gate;
          controller.enqueue(encoder.encode(text.slice(at, after)));
          controller.close();
        },
      });
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    };
  });
  return {
    release: () => page.evaluate(() => (window as unknown as HoldWindow).__releaseTitle?.()),
  };
}
