import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ApplyPage,
  AssessmentPage,
  CreditPage,
  DecisionLabPage,
} from "./features/ascend/index.jsx";
import {
  browserStore,
  defaultSession,
} from "./features/ascend/data/demoStore.js";
import { createDemoServices } from "./features/ascend/integrations/demoServices.js";
import { Icon } from "./features/ascend/components/ui.jsx";
import "./features/ascend/ascend.css";
import "./features/ascend/credit.css";
const store = browserStore();
const demoServices = createDemoServices();
const ROUTES = {
  "/apply": { number: "01", label: "Apply & Consent", title: "Apply & Consent", Page: ApplyPage },
  "/decision-lab": { number: "02", label: "Decision Lab", title: "Cash-flow Decision Lab", Page: DecisionLabPage },
  "/assessment": { number: "03", label: "Assessment", title: "Assessment & Payments", Page: AssessmentPage },
  "/credit": { number: "04", label: "Credit Ladder", title: "CIBIL & Credit Ladder", Page: CreditPage },
};
const routeFor = (pathname) => (ROUTES[pathname] ? pathname : "/apply");
export default function App({ services = demoServices }) {
  const [initial] = useState(() => store.load());
  const [session, setSession] = useState(initial.session);
  const sessionRef = useRef(session);
  const [path,    setPath] = useState(() => routeFor(window.location.pathname));
  const [toast, setToast] = useState("");
  const [warning, setWarning] = useState(initial.warning);
  const [confirmClear, setConfirmClear] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const mainRef = useRef(null);
  const notify = useCallback((message) => setToast(message), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!ROUTES[window.location.pathname])
      window.history.replaceState({}, "", "/apply");
    const handleBack = () => setPath(routeFor(window.location.pathname));
    window.addEventListener("popstate", handleBack);
    return () => window.removeEventListener("popstate", handleBack);
  }, []);
  useEffect(() => {
    document.title = `${ROUTES[path].title} · Ascend`;
  }, [path]);
  const navigate = (next) => {
    if (next === path) return;
    window.history.pushState({}, "", next);
    setPath(next);
    setConfirmClear(false);
    window.scrollTo?.({ top: 0, behavior: "instant" });
    setTimeout(() => mainRef.current?.focus(), 0);
  };
  function update(next, persist = false) {
    const value = typeof next === "function" ? next(sessionRef.current) : next;
    sessionRef.current = value;
    setSession(value);
    if (persist) {
      const result = store.save(value);
      if (!result.ok) setWarning(result.warning);
    }
  }
  function clear() {
    const result = store.clear();
    sessionRef.current = defaultSession();
    setSession(sessionRef.current);
    setResetKey((key) => key + 1);
    setConfirmClear(false);
    navigate("/apply");
    if (result.ok) {
      setWarning("");
      notify("All Ascend data in this browser has been deleted.");
    } else {
      setWarning(result.warning);
      notify("Session reset. Stored data could not be deleted.");
    }
  }
  const ActivePage = ROUTES[path].Page;
  return (
    <div className="ascend-app">
      <a href="#asc-main" className="asc-skip-link">
        Skip to main content
      </a>
      <header className="asc-topbar">
        <button
          className="asc-brand"
          onClick={() => navigate("/apply")}
          aria-label="Ascend, go to Apply"
        >
          <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
            <path d="M3 25 15 4h7L10 25Z" fill="#c47750" />
            <path d="m18 18 4-7 8 14h-8Z" fill="currentColor" />
          </svg>
          <span>
            ascend<span className="asc-brand-dot">.</span>
          </span>
        </button>
        <nav aria-label="Main navigation">
          {Object.entries(ROUTES).map(([href, route]) => (
            <a
              key={href}
              href={href}
              className={path === href ? "active" : ""}
              aria-current={path === href ? "page" : undefined}
              onClick={(event) => {
                if (!event.metaKey && !event.ctrlKey && !event.shiftKey) {
                  event.preventDefault();
                  navigate(href);
                }
              }}
            >
              <span>{route.number}</span> {route.label}
            </a>
          ))}
        </nav>
      </header>
      <main
        id="asc-main"
        tabIndex="-1"
        ref={mainRef}
        className="asc-main"
        key={resetKey}
      >
        {warning && (
          <div className="asc-error" role="alert">
            {warning}
          </div>
        )}
        <ActivePage
          session={session}
          update={update}
          navigate={navigate}
          notify={notify}
          services={services}
        />
      </main>
      <footer className="asc-footer">
        <div>
          <strong>Progress, with perspective.</strong>
          <p>
            Ascend is a technology platform, not a bank or NBFC. Credit is
            offered and approved only by regulated partner lenders.
          </p>
        </div>
        <div className="asc-delete-area">
          {confirmClear ? (
            <div
              className="asc-delete-confirm"
              role="group"
              aria-label="Confirm delete local data"
            >
              <span>Delete this browser’s Ascend records?</span>
              <button className="asc-text-button danger" onClick={clear}>
                Yes, delete
              </button>
              <button
                className="asc-text-button"
                onClick={() => setConfirmClear(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="asc-text-button"
              onClick={() => setConfirmClear(true)}
            >
              <Icon name="bin" size={14} />
              Delete local data
            </button>
          )}
          <small>CASEBLITZ 2026 · PROJECT ASCEND</small>
        </div>
      </footer>
      {toast && (
        <div className="asc-toast" role="status">
          <Icon name="check" size={17} />
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
