import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist/index.css";
import "@fontsource-variable/geist-mono/index.css";
import "./globals.css";
import { Inbox } from "@/components/inbox";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Inbox />
  </StrictMode>
);
