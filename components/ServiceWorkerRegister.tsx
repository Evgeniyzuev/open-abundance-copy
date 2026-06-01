"use client";

import { useEffect } from "react";

const APP_UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const LOCAL_SW_RELOAD_KEY = "open-abundance:local-sw-cleaned:v1";
const APP_SW_RELOAD_KEY = "open-abundance:sw-updated:v1";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const isLocalDev = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
    if (isLocalDev) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .then(() => caches.keys())
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .then(() => {
          if (navigator.serviceWorker.controller && window.sessionStorage.getItem(LOCAL_SW_RELOAD_KEY) !== "1") {
            window.sessionStorage.setItem(LOCAL_SW_RELOAD_KEY, "1");
            window.location.reload();
            return;
          }

          window.sessionStorage.removeItem(LOCAL_SW_RELOAD_KEY);
        })
        .catch((error) => {
          console.warn("Local service worker cleanup failed", error);
        });
      return;
    }

    let lastUpdateCheckAt = 0;
    let removeVisibilityListener: (() => void) | undefined;
    let removeControllerChangeListener: (() => void) | undefined;

    const handleControllerChange = () => {
      if (window.sessionStorage.getItem(APP_SW_RELOAD_KEY) === "1") {
        window.sessionStorage.removeItem(APP_SW_RELOAD_KEY);
        return;
      }

      window.sessionStorage.setItem(APP_SW_RELOAD_KEY, "1");
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    removeControllerChangeListener = () => navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);

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
      removeControllerChangeListener?.();
    };
  }, []);

  return null;
}
