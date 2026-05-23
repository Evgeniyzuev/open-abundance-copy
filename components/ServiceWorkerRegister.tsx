"use client";

import { useEffect } from "react";

const APP_UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let lastUpdateCheckAt = 0;
    let removeVisibilityListener: (() => void) | undefined;

    async function checkForAppUpdate(registration?: ServiceWorkerRegistration) {
      const now = Date.now();
      if (!registration || now - lastUpdateCheckAt < APP_UPDATE_CHECK_INTERVAL_MS) return;
      lastUpdateCheckAt = now;
      await registration.update();
    }

    navigator.serviceWorker.register("/sw.js")
      .then((registration) => {
        checkForAppUpdate(registration).catch((error) => {
          console.warn("Service worker update check failed", error);
        });

        const handleVisibilityChange = () => {
          if (document.visibilityState !== "visible") return;
          checkForAppUpdate(registration).catch((error) => {
            console.warn("Service worker update check failed", error);
          });
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        removeVisibilityListener = () => document.removeEventListener("visibilitychange", handleVisibilityChange);
      })
      .catch((error) => {
        console.warn("Service worker registration failed", error);
      });

    return () => {
      removeVisibilityListener?.();
    };
  }, []);

  return null;
}
