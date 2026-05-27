import AppNavigation from "@/components/AppNavigation";
import NotesApp from "@/components/NotesApp";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { UserProvider } from "@/components/UserProvider";

export default function Home() {
  return (
    <main className="app-shell">
      <ServiceWorkerRegister />
      <UserProvider>
        <AppNavigation notesSlot={<NotesApp />} />
      </UserProvider>
    </main>
  );
}
