"use client";

import { useEffect } from "react";

const APP_UPDATE_CHECK_INTERVAL_MS = 30 * 1000;
const DEV_SW_RELOAD_KEY = "open-abundance:dev-sw-cleanup-reload";
const SW_CONTROLLER_RELOAD_KEY = "open-abundance:sw-controller-reload";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const isLocalDev = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
    if (isLocalDev) {
      let cancelled = false;

      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .then(() => ("caches" in window ? caches.keys() : []))
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .then(() => {
          if (cancelled) return;

          if (navigator.serviceWorker.controller && sessionStorage.getItem(DEV_SW_RELOAD_KEY) !== "1") {
            sessionStorage.setItem(DEV_SW_RELOAD_KEY, "1");
            window.location.reload();
            return;
          }

          if (!navigator.serviceWorker.controller) {
            sessionStorage.removeItem(DEV_SW_RELOAD_KEY);
          }
        })
        .catch((error) => {
          console.warn("Local service worker cleanup failed", error);
        });

      return () => {
        cancelled = true;
      };
    }

    let lastUpdateCheckAt = 0;
    let removeVisibilityListener: (() => void) | undefined;
    const reloadGuardReset = window.setTimeout(() => {
      sessionStorage.removeItem(SW_CONTROLLER_RELOAD_KEY);
    }, 1000);

    async function checkForAppUpdate(registration?: ServiceWorkerRegistration) {
      const now = Date.now();
      if (!registration || now - lastUpdateCheckAt < APP_UPDATE_CHECK_INTERVAL_MS) return;
      lastUpdateCheckAt = now;
      await registration.update();
    }

    const handleControllerChange = () => {
      if (sessionStorage.getItem(SW_CONTROLLER_RELOAD_KEY) === "1") return;
      sessionStorage.setItem(SW_CONTROLLER_RELOAD_KEY, "1");
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

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
      window.clearTimeout(reloadGuardReset);
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      removeVisibilityListener?.();
    };
  }, []);

  return null;
}
