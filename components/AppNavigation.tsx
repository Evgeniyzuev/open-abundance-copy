"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { CheckSquare, FileText, Heart, Map, Sparkles, Target, Trophy, TrendingUp, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import ChallengesApp from "@/components/ChallengesApp";
import RecommendedWishes from "@/components/RecommendedWishes";
import SocialApp from "@/components/SocialApp";
import TasksApp from "@/components/TasksApp";
import WalletApp from "@/components/WalletApp";

type MainTabId = "goals" | "challenges" | "spark" | "wallet" | "people";
type GoalTabId = "desires" | "notes" | "checks" | "map" | "growth";

type MainTab = {
  id: MainTabId;
  title: string;
  icon: LucideIcon;
};

type GoalTab = {
  id: GoalTabId;
  title: string;
  icon: LucideIcon;
};

type AppNavigationProps = {
  notesSlot: ReactNode;
};

const mainTabs: MainTab[] = [
  { id: "goals", title: "Цели", icon: Target },
  { id: "challenges", title: "Challenges", icon: Trophy },
  { id: "spark", title: "Идеи", icon: Sparkles },
  { id: "wallet", title: "Кошелек", icon: Wallet },
  { id: "people", title: "Social", icon: Users }
];

const goalTabs: GoalTab[] = [
  { id: "desires", title: "Желания", icon: Heart },
  { id: "notes", title: "Заметки", icon: FileText },
  { id: "checks", title: "Проверки", icon: CheckSquare },
  { id: "map", title: "Карта", icon: Map },
  { id: "growth", title: "Рост", icon: TrendingUp }
];

const REFRESH_COOLDOWN_MS = 5_000;
const PULL_THRESHOLD_PX = 72;

export default function AppNavigation({ notesSlot }: AppNavigationProps) {
  const [activeMainTab, setActiveMainTab] = useState<MainTabId>("goals");
  const [activeGoalTab, setActiveGoalTab] = useState<GoalTabId>("notes");
  const [navHidden, setNavHidden] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const lastRefreshAtRef = useRef(0);
  const pullDistanceRef = useRef(0);
  const touchStartYRef = useRef(0);

  useEffect(() => {
    let lastScrollY = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const delta = currentScrollY - lastScrollY;

      if (Math.abs(delta) > 8) {
        setNavHidden(delta > 0 && currentScrollY > 90);
        lastScrollY = currentScrollY;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const requestRefresh = () => {
      const now = Date.now();
      if (now - lastRefreshAtRef.current < REFRESH_COOLDOWN_MS) return;
      lastRefreshAtRef.current = now;
      setRefreshNonce((value) => value + 1);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (window.scrollY > 0 || event.touches.length !== 1) return;
      touchStartYRef.current = event.touches[0].clientY;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (window.scrollY > 0 || touchStartYRef.current === 0) return;
      const distance = event.touches[0].clientY - touchStartYRef.current;
      if (distance <= 0) return;
      const nextDistance = Math.min(distance, PULL_THRESHOLD_PX);
      pullDistanceRef.current = nextDistance;
      setIsPulling(true);
      setPullDistance(nextDistance);
    };

    const handleTouchEnd = () => {
      if (pullDistanceRef.current >= PULL_THRESHOLD_PX) requestRefresh();
      touchStartYRef.current = 0;
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
  }, []);

  const currentTitle = getCurrentTitle(activeMainTab, activeGoalTab);
  const showNotes = activeMainTab === "goals" && activeGoalTab === "notes";
  const showWishes = activeMainTab === "goals" && activeGoalTab === "desires";
  const showChecks = activeMainTab === "goals" && activeGoalTab === "checks";
  const showChallenges = activeMainTab === "challenges";
  const showWallet = activeMainTab === "wallet";
  const showPeople = activeMainTab === "people";

  return (
    <>
      <div className={`pull-refresh-indicator ${isPulling ? "visible" : ""}`} style={{ transform: `translate(-50%, ${pullDistance}px)` }}>
        {pullDistance >= PULL_THRESHOLD_PX ? "Отпустите" : "Потяните"}
      </div>
      <TopTabBar activeMainTab={activeMainTab} activeGoalTab={activeGoalTab} hidden={navHidden} onGoalTabChange={setActiveGoalTab} />
      <section className="app-content">
        {showNotes ? notesSlot : null}
        {showWishes ? <RecommendedWishes refreshNonce={refreshNonce} /> : null}
        {showChecks ? <TasksApp /> : null}
        {showChallenges ? <ChallengesApp refreshNonce={refreshNonce} /> : null}
        {showWallet ? <WalletApp refreshNonce={refreshNonce} /> : null}
        {showPeople ? <SocialApp refreshNonce={refreshNonce} /> : null}
        {!showNotes && !showWishes && !showChecks && !showChallenges && !showWallet && !showPeople ? <PlaceholderScreen title={currentTitle} /> : null}
      </section>
      <BottomTabBar activeTab={activeMainTab} hidden={navHidden} onTabChange={setActiveMainTab} />
    </>
  );
}

type TopTabBarProps = {
  activeMainTab: MainTabId;
  activeGoalTab: GoalTabId;
  hidden: boolean;
  onGoalTabChange: (tab: GoalTabId) => void;
};

function TopTabBar({ activeMainTab, activeGoalTab, hidden, onGoalTabChange }: TopTabBarProps) {
  const tabs = activeMainTab === "goals" ? goalTabs : [];

  return (
    <nav className={`glass-tabbar top-tabbar ${hidden ? "nav-hidden" : ""}`} aria-label="Вложенная навигация">
      {tabs.length > 0 ? (
        tabs.map((tab) => (
          <TabButton
            active={tab.id === activeGoalTab}
            icon={tab.icon}
            key={tab.id}
            title={tab.title}
            onClick={() => onGoalTabChange(tab.id)}
          />
        ))
      ) : (
        <span className="tabbar-title">{getMainTabTitle(activeMainTab)}</span>
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
  onTabChange: (tab: MainTabId) => void;
};

function BottomTabBar({ activeTab, hidden, onTabChange }: BottomTabBarProps) {
  return (
    <nav className={`glass-tabbar bottom-tabbar ${hidden ? "nav-hidden" : ""}`} aria-label="Основная навигация">
      {mainTabs.map((tab) => (
        <TabButton
          active={tab.id === activeTab}
          icon={tab.icon}
          key={tab.id}
          title={tab.title}
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

function getMainTabTitle(tab: MainTabId): string {
  return mainTabs.find((item) => item.id === tab)?.title ?? "Раздел";
}

function getCurrentTitle(mainTab: MainTabId, goalTab: GoalTabId): string {
  if (mainTab !== "goals") return getMainTabTitle(mainTab);
  return goalTabs.find((item) => item.id === goalTab)?.title ?? "Цели";
}

