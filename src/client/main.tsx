import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./globals.css";
import { Inbox } from "@/components/inbox";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Inbox />
  </StrictMode>
);
