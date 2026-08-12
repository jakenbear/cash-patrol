import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import App from "./App";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
const convexUrl = import.meta.env.VITE_CONVEX_URL;

if (!convexUrl) {
  root.render(
    <StrictMode>
      <main className="configuration-screen">
        <div className="brand-mark">$</div>
        <h1>Cash Patrol</h1>
        <p>
          Add <code>VITE_CONVEX_URL</code> to <code>.env.local</code> to connect
          this app to Convex.
        </p>
      </main>
    </StrictMode>,
  );
} else {
  const convex = new ConvexReactClient(convexUrl);
  root.render(
    <StrictMode>
      <ConvexAuthProvider client={convex}>
        <App />
      </ConvexAuthProvider>
    </StrictMode>,
  );
}
