import { NextResponse } from "next/server";

type IncomingNote = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
};

export async function POST(request: Request) {
  const body = (await request.json()) as { notes?: IncomingNote[] };
  const now = new Date().toISOString();
  const notes = Array.isArray(body.notes) ? body.notes : [];

  return NextResponse.json({
    syncedAt: now,
    notes: notes.map((note) => ({
      ...note,
      syncStatus: "synced",
      serverVersion: now
    }))
  });
}
