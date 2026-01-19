import { HydratedRouter } from "react-router/dom";
import { startTransition, StrictMode } from "react";
import { hydrateRoot, createRoot } from "react-dom/client";

// In SPA mode, we might not always hydrate if the server didn't render it.
// If root is empty, we createRoot. If it has content, we hydrate.
// But usually hydrateRoot works fine if we expect partial content or just empty div.
// For pure SPA with empty div #root, we should use createRoot usually?
// Remix/RR7 usually expects hydration even in SPA mode if it simulates it?
// Docs for SPA mode say "Hydrate the app". But standard SPA uses createRoot.
// Let's assume createRoot is safer if we just have <div id="root"></div>
// But RR7 <HydratedRouter> implies hydration.
// Let's try createRoot for pure SPA.

const rootElement = document.getElementById("root");

if (rootElement && !rootElement.innerHTML) {
    const root = createRoot(rootElement);
    root.render(
        <StrictMode>
            <HydratedRouter />
        </StrictMode>
    );
} else if (rootElement) {
    startTransition(() => {
        hydrateRoot(
            rootElement,
            <StrictMode>
                <HydratedRouter />
            </StrictMode>
        );
    });
}
