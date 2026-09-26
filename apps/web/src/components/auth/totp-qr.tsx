"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function TotpQr({ uri }: { uri: string }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(uri, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 208,
      color: { dark: "#111111", light: "#ffffff" },
    }).then((dataUrl) => {
      if (!cancelled) {
        setSrc(dataUrl);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  if (!src) {
    return <p className="text-sm text-[var(--muted)]">Préparation du QR code…</p>;
  }

  return (
    <figure className="flex flex-col items-center gap-3">
      <img
        src={src}
        alt="QR code d’activation du second facteur"
        width={208}
        height={208}
        className="size-52 bg-white p-2"
      />
      <figcaption className="text-center text-sm text-[var(--muted)]">
        Scannez ce code avec Google Authenticator, Authy ou Microsoft Authenticator.
      </figcaption>
    </figure>
  );
}
