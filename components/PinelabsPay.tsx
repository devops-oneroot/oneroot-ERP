"use client";

import { CheckCircle2, CreditCard, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { inr } from "@/lib/format";
import { Button, InfinityLoader, Modal, errMsg } from "./ui";

/** A payment on the Pine Labs terminal, as the API reports it */
export interface TerminalPayment {
  id: string;
  status: "PENDING" | "APPROVED" | "FAILED" | "CANCELLED";
  amount: number;
  message: string | null;
  mode: "CARD" | "UPI" | null;
  paymentModeText: string | null;
  rrn: string | null;
  approvalCode: string | null;
  cardLast4: string | null;
  ptrid: string | null;
  used: boolean;
  /** An approved payment of this amount that hasn't been billed yet was found and is used again */
  reused: boolean;
}

const POLL_MS = 3000;

/** One line about an approved payment: mode, card / RRN */
export function terminalPaymentText(t: TerminalPayment) {
  return [t.paymentModeText ?? t.mode, t.cardLast4 ? `****${t.cardLast4}` : null, t.rrn ? `RRN ${t.rrn}` : null].filter(Boolean).join(" · ");
}

/**
 * Sends the amount to the branch's Pine Labs terminal and waits while the customer pays there by card or UPI.
 * Calls onApproved once Pine Labs approves; the bill is then saved against that payment.
 */
export function PinelabsPayModal({ amount, onClose, onApproved }: { amount: number; onClose: () => void; onApproved: (t: TerminalPayment) => void }) {
  const [txn, setTxn] = useState<TerminalPayment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Latest callback, without restarting the payment when the parent re-renders
  const approvedRef = useRef(onApproved);
  useEffect(() => {
    approvedRef.current = onApproved;
  });

  // Start (again on "Try again"), then ask every few seconds until it's settled
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (t: TerminalPayment) => {
      if (!live) return;
      setTxn(t);
      if (t.status === "APPROVED") approvedRef.current(t);
      else if (t.status === "PENDING") timer = setTimeout(() => void poll(t.id), POLL_MS);
    };
    const poll = async (id: string) => {
      try {
        settle(await api.get<TerminalPayment>(`/pinelabs/txns/${id}`));
      } catch (e) {
        if (!live) return;
        // A blip while waiting: keep asking
        setError(errMsg(e));
        timer = setTimeout(() => void poll(id), POLL_MS * 2);
      }
    };
    api
      .post<TerminalPayment>("/pinelabs/txns", { amount })
      .then((t) => {
        if (live) setError(null);
        settle(t);
      })
      .catch((e) => live && setError(errMsg(e)));
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [amount, attempt]);

  async function cancel() {
    if (!txn || txn.status !== "PENDING") return onClose();
    setCancelling(true);
    try {
      const t = await api.post<TerminalPayment>(`/pinelabs/txns/${txn.id}/cancel`);
      setTxn(t);
      if (t.status === "APPROVED") onApproved(t);
      else if (t.status !== "PENDING") onClose();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setCancelling(false);
    }
  }

  const waiting = !txn || txn.status === "PENDING";
  const failed = txn && (txn.status === "FAILED" || txn.status === "CANCELLED");

  return (
    // Closing while waiting would leave the terminal asking: only Cancel (which stops it) closes then
    <Modal open onClose={waiting && txn ? () => void cancel() : onClose} title="Pine Labs Terminal" size="sm" sheet>
      <div className="space-y-4 text-center">
        <p className="num text-3xl font-bold text-slate-900">{inr(amount)}</p>
        {txn?.status === "APPROVED" ? (
          <div className="flex flex-col items-center gap-2 text-green-700">
            <CheckCircle2 className="size-10" />
            <p className="font-semibold">Payment approved{txn.reused ? " (paid earlier, not billed yet)" : ""}</p>
            <p className="text-sm text-slate-600">{terminalPaymentText(txn)}</p>
            <p className="text-xs text-slate-500">Saving the bill…</p>
          </div>
        ) : failed ? (
          <div className="flex flex-col items-center gap-2 text-red-600">
            <XCircle className="size-10" />
            <p className="font-semibold">{txn.status === "CANCELLED" ? "Payment cancelled" : "Payment not completed"}</p>
            {txn.message && <p className="text-sm text-slate-600">{txn.message}</p>}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            {txn ? <InfinityLoader className="size-12" /> : <CreditCard className="size-10 text-brand-600" />}
            <p className="font-semibold text-slate-800">{txn ? "Ask the customer to pay on the terminal" : "Sending to the terminal…"}</p>
            <p className="text-sm text-slate-500">Card (tap / insert / swipe) or UPI QR on the Pine Labs machine. This screen updates by itself.</p>
          </div>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-center gap-2">
          {waiting && txn ? (
            <Button variant="danger" loading={cancelling} onClick={() => void cancel()}>
              Cancel Payment
            </Button>
          ) : txn?.status === "APPROVED" ? null : (
            <>
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
              <Button
                onClick={() => {
                  setTxn(null);
                  setError(null);
                  setAttempt((a) => a + 1);
                }}
              >
                Try Again
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
