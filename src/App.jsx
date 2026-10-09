import React, { useCallback, useEffect, useRef, useState } from "react";
import { ApplyPage, DecisionLabPage } from "./features/ascend/index.jsx";
import {
  browserStore,
  defaultSession,
} from "./features/ascend/data/demoStore.js";
import { Badge, Icon } from "./features/ascend/components/ui.jsx";
import "./features/ascend/ascend.css";
const store = browserStore();
export default function App() {
  const [initial] = useState(() => store.load());
  const [session, setSession] = useState(initial.session);
  const [path, setPath] = useState(() =>
    window.location.pathname === "/decision-lab" ? "/decision-lab" : "/apply",
  );
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
    if (!["/apply", "/decision-lab"].includes(window.location.pathname))
      window.history.replaceState({}, "", "/apply");
    const handleBack = () =>
      setPath(
        window.location.pathname === "/decision-lab"
          ? "/decision-lab"
          : "/apply",
      );
    window.addEventListener("popstate", handleBack);
    return () => window.removeEventListener("popstate", handleBack);
  }, []);
  useEffect(() => {
    document.title = `${path === "/apply" ? "Apply & Consent" : "Cash-flow Decision Lab"} · Ascend`;
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
    setSession(next);
    if (persist) {
      const result = store.save(next);
      if (!result.ok) setWarning(result.warning);
    }
  }
  function clear() {
    const result = store.clear();
    setSession(defaultSession());
    setResetKey((key) => key + 1);
    setConfirmClear(false);
    navigate("/apply");
    if (result.ok) {
      setWarning("");
      notify("All Ascend demo data in this browser has been deleted.");
    } else {
      setWarning(result.warning);
      notify("Session reset. Stored data could not be deleted.");
    }
  }
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
          <a
            href="/apply"
            className={path === "/apply" ? "active" : ""}
            aria-current={path === "/apply" ? "page" : undefined}
            onClick={(event) => {
              if (!event.metaKey && !event.ctrlKey && !event.shiftKey) {
                event.preventDefault();
                navigate("/apply");
              }
            }}
          >
            <span>01</span> Apply & Consent
          </a>
          <a
            href="/decision-lab"
            className={path === "/decision-lab" ? "active" : ""}
            aria-current={path === "/decision-lab" ? "page" : undefined}
            onClick={(event) => {
              if (!event.metaKey && !event.ctrlKey && !event.shiftKey) {
                event.preventDefault();
                navigate("/decision-lab");
              }
            }}
          >
            <span>02</span> Decision Lab
          </a>
        </nav>
        <Badge dot tone="green">
          PROTOTYPE
        </Badge>
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
        {path === "/apply" ? (
          <ApplyPage
            session={session}
            update={update}
            navigate={navigate}
            notify={notify}
          />
        ) : (
          <DecisionLabPage
            session={session}
            update={update}
            navigate={navigate}
            notify={notify}
          />
        )}
      </main>
      <footer className="asc-footer">
        <div>
          <strong>Progress, with perspective.</strong>
          <p>
            Ascend is a technology prototype, not a bank or NBFC. All identities
            and financial interactions are simulated. No money moves and no
            credit is promised.
          </p>
        </div>
        <div className="asc-delete-area">
          {confirmClear ? (
            <div
              className="asc-delete-confirm"
              role="group"
              aria-label="Confirm delete demo data"
            >
              <span>Delete this browser’s demo records?</span>
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
              Delete local demo data
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
