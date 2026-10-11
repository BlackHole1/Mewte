import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "./index.css";
import "./i18n";
import { App } from "./app";
import { LoadingBlock } from "./components/page";
import { AnchoredToastProvider, ToastProvider } from "./components/ui/toast";
import { queryClient } from "./lib/queries";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AnchoredToastProvider>
          <BrowserRouter>
            {/* isolate keeps Base UI's portaled popups above the page content. */}
            <div className="isolate min-h-svh">
              <Suspense fallback={<LoadingBlock />}>
                <App />
              </Suspense>
            </div>
          </BrowserRouter>
        </AnchoredToastProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
