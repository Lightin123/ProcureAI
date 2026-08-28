import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App.js";
import { AuthProvider } from "./auth/AuthContext.js";
import "./styles.css";

const container = document.getElementById("root");

if (container === null) {
  throw new Error("Root element #root was not found in the document.");
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
