import AppNavigation from "@/components/AppNavigation";
import NotesApp from "@/components/NotesApp";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export default function Home() {
  return (
    <main className="app-shell">
      <ServiceWorkerRegister />
      <AppNavigation notesSlot={<NotesApp />} />
    </main>
  );
}
