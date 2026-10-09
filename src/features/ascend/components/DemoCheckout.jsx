import React, { useEffect, useRef } from "react";
import { Badge, Icon } from "./ui.jsx";
import { inr } from "./creditUi.jsx";
import { DEMO_NETBANKING_BANKS, PAYMENT_PURPOSES } from "../integrations/demoServices.js";

/**
 * Stand-in for a payment provider's hosted checkout or the bank's own page.
 * It never collects a UPI PIN or bank password; in production this screen belongs to the provider.
 */
export function DemoCheckout({ transaction, upiId, bankId, onOutcome }) {
  const firstButton = useRef(null);
  const handler = useRef(onOutcome);
  handler.current = onOutcome;
  useEffect(() => {
    firstButton.current?.focus();
    const onKey = (event) => event.key === "Escape" && handler.current("CANCELLED");
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const bank = DEMO_NETBANKING_BANKS.find((item) => item.id === bankId);
  return (
    <div className="asc-overlay">
      <div className="asc-checkout" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
        <div className="asc-checkout-head">
          <Badge tone="green">PAYMENT GATEWAY</Badge>
          <span>{transaction.transactionId}</span>
        </div>
        <h2 id="checkout-title">Complete your payment</h2>
        <p className="asc-muted">
          {PAYMENT_PURPOSES[transaction.purpose]} · {transaction.method === "UPI" ? "UPI" : "Net banking"}
        </p>
        <strong className="asc-checkout-amount">{inr(transaction.amount)}</strong>
        <div className="asc-inline-note">
          <Icon name="lock" size={17} />
          <span>
            {transaction.method === "UPI"
              ? `A collect request has been sent to ${upiId}. Approve it in your UPI app with your PIN. Ascend never asks for it.`
              : `Continue on ${bank?.name ?? "your bank"}'s own page. Ascend never sees your bank login or password.`}
          </span>
        </div>
        <div className="asc-checkout-actions">
          <button ref={firstButton} className="asc-button primary" onClick={() => onOutcome("SUCCESS")}>
            I have approved the payment
          </button>
          <button className="asc-text-button" onClick={() => onOutcome("CANCELLED")}>
            Cancel and return to Ascend
          </button>
        </div>
        <p className="asc-caption">After you return, Ascend confirms the status with the payment provider instead of trusting this page.</p>
      </div>
    </div>
  );
}
