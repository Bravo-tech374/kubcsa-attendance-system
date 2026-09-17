"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

type QrScannerProps = { onDetected: (value: string) => void; onClose: () => void };

export default function QrScanner({ onDetected, onClose }: QrScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const scanner = new Html5Qrcode("kubcsa-qr-reader");
    scannerRef.current = scanner;
    scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 240, height: 240 } }, (decodedText) => { onDetected(decodedText); void scanner.stop(); }, () => undefined).catch(() => setError("Camera access was unavailable. Enter the event code manually instead."));
    return () => { if (scanner.isScanning) void scanner.stop().catch(() => undefined); };
  }, [onDetected]);

  return <div className="scanner-modal"><div className="scanner-header"><div><p className="eyebrow">QR VERIFICATION</p><h2>Scan event code</h2></div><button className="close-button" onClick={onClose}>×</button></div><div id="kubcsa-qr-reader" className="qr-reader" />{error && <div className="form-error">{error}</div>}<p className="scanner-note">Point your camera at the QR code displayed at the event venue.</p><button className="secondary-button scanner-cancel" onClick={onClose}>Enter code manually</button></div>;
}
