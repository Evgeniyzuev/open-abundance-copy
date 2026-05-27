import AppNavigation from "@/components/AppNavigation";
import NotesApp from "@/components/NotesApp";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import UserBootstrap from "@/components/UserBootstrap";

export default function Home() {
  return (
    <main className="app-shell">
      <ServiceWorkerRegister />
      <UserBootstrap />
      <AppNavigation notesSlot={<NotesApp />} />
    </main>
  );
}
