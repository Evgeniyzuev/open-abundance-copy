import NotesApp from "@/components/NotesApp";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export default function Home() {
  return (
    <main className="app-shell">
      <ServiceWorkerRegister />
      <NotesApp />
    </main>
  );
}
