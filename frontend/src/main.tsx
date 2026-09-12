import { LazyMotion, domMax } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "@/app/App";
import { initTelegram } from "@/shared/lib/telegram";

import "@/styles/index.css";

initTelegram();

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <LazyMotion features={domMax} strict>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </LazyMotion>
  </StrictMode>,
);
