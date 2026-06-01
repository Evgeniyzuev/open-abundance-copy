"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { CheckSquare, FileText, Heart, Landmark, Map, Sparkles, Target, Trophy, TrendingUp, UserRound, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import ChallengesApp from "@/components/ChallengesApp";
import RecommendedWishes from "@/components/RecommendedWishes";
import SocialApp from "@/components/SocialApp";
import TasksApp from "@/components/TasksApp";
import { useUserContext } from "@/components/UserProvider";
import WalletApp from "@/components/WalletApp";
import type { MessageKey } from "@/lib/i18n";

type MainTabId = "goals" | "challenges" | "spark" | "wallet" | "people";
type GoalTabId = "desires" | "notes" | "checks" | "map" | "growth";
type WalletTabId = "wallet" | "core";
type SocialTabId = "profile" | "teams";
type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

type MainTab = {
  id: MainTabId;
  titleKey: MessageKey;
  icon: LucideIcon;
};

type GoalTab = {
  id: GoalTabId;
  titleKey: MessageKey;
  icon: LucideIcon;
};

type TopTab = {
  id: string;
  titleKey: MessageKey;
  icon: LucideIcon;
};

type AppNavigationProps = {
  notesSlot: ReactNode;
};

const mainTabs: MainTab[] = [
  { id: "goals", titleKey: "app.nav.goals", icon: Target },
  { id: "challenges", titleKey: "app.nav.challenges", icon: Trophy },
  { id: "spark", titleKey: "app.nav.spark", icon: Sparkles },
  { id: "wallet", titleKey: "app.nav.wallet", icon: Wallet },
  { id: "people", titleKey: "app.nav.people", icon: Users }
];

const goalTabs: GoalTab[] = [
  { id: "desires", titleKey: "app.nav.desires", icon: Heart },
  { id: "notes", titleKey: "app.nav.notes", icon: FileText },
  { id: "checks", titleKey: "app.nav.checks", icon: CheckSquare },
  { id: "map", titleKey: "app.nav.map", icon: Map },
  { id: "growth", titleKey: "app.nav.growth", icon: TrendingUp }
];

const walletTabs: TopTab[] = [
  { id: "wallet", titleKey: "app.nav.wallet", icon: Wallet },
  { id: "core", titleKey: "wallet.core", icon: Landmark }
];

const socialTabs: TopTab[] = [
  { id: "profile", titleKey: "profile.title", icon: UserRound },
  { id: "teams", titleKey: "app.nav.people", icon: Users }
];

const REFRESH_COOLDOWN_MS = 5_000;
const PULL_THRESHOLD_PX = 72;
const NAV_HIDE_DELTA_PX = 8;

export default function AppNavigation({ notesSlot }: AppNavigationProps) {
  const { refreshUserData, t } = useUserContext();
  const [activeMainTab, setActiveMainTab] = useState<MainTabId>("goals");
  const [activeGoalTab, setActiveGoalTab] = useState<GoalTabId>("notes");
  const [activeWalletTab, setActiveWalletTab] = useState<WalletTabId>("wallet");
  const [activeSocialTab, setActiveSocialTab] = useState<SocialTabId>("profile");
  const [navHidden, setNavHidden] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const lastRefreshAtRef = useRef(0);
  const pullDistanceRef = useRef(0);
  const touchStartYRef = useRef(0);
  const lastGestureTouchYRef = useRef(0);

  const updateNavFromScrollIntent = useCallback((delta: number) => {
    if (Math.abs(delta) <= NAV_HIDE_DELTA_PX) return;
    if (delta < 0) {
      setNavHidden(false);
      return;
    }

    setNavHidden(true);
  }, []);

  useEffect(() => {
    let lastScrollY = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const delta = currentScrollY - lastScrollY;

      if (Math.abs(delta) > NAV_HIDE_DELTA_PX) {
        updateNavFromScrollIntent(delta);
        lastScrollY = currentScrollY;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [updateNavFromScrollIntent]);

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      updateNavFromScrollIntent(event.deltaY);
    };

    window.addEventListener("wheel", handleWheel, { passive: true });
    return () => window.removeEventListener("wheel", handleWheel);
  }, [updateNavFromScrollIntent]);

  useEffect(() => {
    setNavHidden(false);
  }, [activeMainTab, activeGoalTab, activeWalletTab, activeSocialTab]);

  const refreshServerBackedData = useCallback(() => {
    refreshUserData().catch((refreshError) => {
      console.warn("App refresh failed", refreshError);
    });
    setRefreshNonce((value) => value + 1);
  }, [refreshUserData]);

  useEffect(() => {
    const requestRefresh = () => {
      const now = Date.now();
      if (now - lastRefreshAtRef.current < REFRESH_COOLDOWN_MS) return;
      lastRefreshAtRef.current = now;
      refreshServerBackedData();
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touchY = event.touches[0].clientY;
      lastGestureTouchYRef.current = touchY;
      if (window.scrollY > 0) return;
      touchStartYRef.current = touchY;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touchY = event.touches[0].clientY;
      if (lastGestureTouchYRef.current !== 0) {
        updateNavFromScrollIntent(lastGestureTouchYRef.current - touchY);
      }
      lastGestureTouchYRef.current = touchY;

      if (window.scrollY > 0 || touchStartYRef.current === 0) return;
      const distance = touchY - touchStartYRef.current;
      if (distance <= 0) return;
      const nextDistance = Math.min(distance, PULL_THRESHOLD_PX);
      pullDistanceRef.current = nextDistance;
      setIsPulling(true);
      setPullDistance(nextDistance);
    };

    const handleTouchEnd = () => {
      if (pullDistanceRef.current >= PULL_THRESHOLD_PX) requestRefresh();
      touchStartYRef.current = 0;
      lastGestureTouchYRef.current = 0;
      pullDistanceRef.current = 0;
      setIsPulling(false);
      setPullDistance(0);
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [refreshServerBackedData, updateNavFromScrollIntent]);

  useEffect(() => {
    if (!isServerBackedTab(activeMainTab, activeGoalTab)) return;
    refreshServerBackedData();
  }, [activeGoalTab, activeMainTab, activeSocialTab, activeWalletTab, refreshServerBackedData]);

  const currentTitle = getCurrentTitle(activeMainTab, activeGoalTab, t);
  const showNotes = activeMainTab === "goals" && activeGoalTab === "notes";
  const showWishes = activeMainTab === "goals" && activeGoalTab === "desires";
  const showChecks = activeMainTab === "goals" && activeGoalTab === "checks";
  const showChallenges = activeMainTab === "challenges";
  const showWallet = activeMainTab === "wallet";
  const showPeople = activeMainTab === "people";
  const topTabs = getTopTabs(activeMainTab);
  const activeTopTab = getActiveTopTab(activeMainTab, activeGoalTab, activeWalletTab, activeSocialTab);

  function handleTopTabChange(tab: string) {
    if (activeMainTab === "goals") setActiveGoalTab(tab as GoalTabId);
    if (activeMainTab === "wallet") setActiveWalletTab(tab as WalletTabId);
    if (activeMainTab === "people") setActiveSocialTab(tab as SocialTabId);
  }

  return (
    <>
      <div className={`pull-refresh-indicator ${isPulling ? "visible" : ""}`} style={{ transform: `translate(-50%, ${pullDistance}px)` }}>
        {pullDistance >= PULL_THRESHOLD_PX ? t("app.pull.release") : t("app.pull.drag")}
      </div>
      <TopTabBar activeMainTab={activeMainTab} activeTab={activeTopTab} hidden={navHidden} tabs={topTabs} t={t} onTabChange={handleTopTabChange} />
      <section className="app-content">
        {showNotes ? notesSlot : null}
        {showWishes ? <RecommendedWishes refreshNonce={refreshNonce} /> : null}
        {showChecks ? <TasksApp /> : null}
        {showChallenges ? <ChallengesApp refreshNonce={refreshNonce} /> : null}
        {showWallet ? <WalletApp activeTab={activeWalletTab} refreshNonce={refreshNonce} /> : null}
        {showPeople ? <SocialApp activeTab={activeSocialTab} refreshNonce={refreshNonce} /> : null}
        {!showNotes && !showWishes && !showChecks && !showChallenges && !showWallet && !showPeople ? <PlaceholderScreen title={currentTitle} /> : null}
      </section>
      <BottomTabBar activeTab={activeMainTab} hidden={navHidden} t={t} onTabChange={setActiveMainTab} />
    </>
  );
}

type TopTabBarProps = {
  activeMainTab: MainTabId;
  activeTab?: string;
  hidden: boolean;
  tabs: TopTab[];
  t: TFunction;
  onTabChange: (tab: string) => void;
};

function TopTabBar({ activeMainTab, activeTab, hidden, tabs, t, onTabChange }: TopTabBarProps) {
  return (
    <nav className={`glass-tabbar top-tabbar ${hidden ? "nav-hidden" : ""}`} aria-label={t("app.nav.top")}>
      {tabs.length > 0 ? (
        tabs.map((tab) => (
          <TabButton
            active={tab.id === activeTab}
            icon={tab.icon}
            key={tab.id}
            title={t(tab.titleKey)}
            onClick={() => onTabChange(tab.id)}
          />
        ))
      ) : (
        <span className="tabbar-title">{getMainTabTitle(activeMainTab, t)}</span>
      )}
    </nav>
  );
}

type TabButtonProps = {
  active: boolean;
  icon: LucideIcon;
  title: string;
  onClick: () => void;
};

function TabButton({ active, icon: Icon, title, onClick }: TabButtonProps) {
  return (
    <button
      className={active ? "tab-button active" : "tab-button"}
      type="button"
      aria-label={title}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      <Icon size={28} strokeWidth={active ? 2.5 : 2} />
    </button>
  );
}

type BottomTabBarProps = {
  activeTab: MainTabId;
  hidden: boolean;
  t: TFunction;
  onTabChange: (tab: MainTabId) => void;
};

function BottomTabBar({ activeTab, hidden, t, onTabChange }: BottomTabBarProps) {
  return (
    <nav className={`glass-tabbar bottom-tabbar ${hidden ? "nav-hidden" : ""}`} aria-label={t("app.nav.bottom")}>
      {mainTabs.map((tab) => (
        <TabButton
          active={tab.id === activeTab}
          icon={tab.icon}
          key={tab.id}
          title={t(tab.titleKey)}
          onClick={() => onTabChange(tab.id)}
        />
      ))}
    </nav>
  );
}

function PlaceholderScreen({ title }: { title: string }) {
  return (
    <section className="placeholder-screen">
      <h1>{title}</h1>
    </section>
  );
}

function getMainTabTitle(tab: MainTabId, t: TFunction): string {
  const titleKey = mainTabs.find((item) => item.id === tab)?.titleKey;
  return titleKey ? t(titleKey) : t("app.nav.section");
}

function getTopTabs(tab: MainTabId): TopTab[] {
  if (tab === "goals") return goalTabs;
  if (tab === "wallet") return walletTabs;
  if (tab === "people") return socialTabs;
  return [];
}

function getActiveTopTab(
  mainTab: MainTabId,
  goalTab: GoalTabId,
  walletTab: WalletTabId,
  socialTab: SocialTabId
): string | undefined {
  if (mainTab === "goals") return goalTab;
  if (mainTab === "wallet") return walletTab;
  if (mainTab === "people") return socialTab;
  return undefined;
}

function getCurrentTitle(mainTab: MainTabId, goalTab: GoalTabId, t: TFunction): string {
  if (mainTab !== "goals") return getMainTabTitle(mainTab, t);
  const titleKey = goalTabs.find((item) => item.id === goalTab)?.titleKey;
  return titleKey ? t(titleKey) : t("app.nav.goals");
}

function isServerBackedTab(mainTab: MainTabId, goalTab: GoalTabId): boolean {
  if (mainTab === "challenges" || mainTab === "wallet" || mainTab === "people") return true;
  return mainTab === "goals" && goalTab === "desires";
}
