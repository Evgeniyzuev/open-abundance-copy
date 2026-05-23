import { NextResponse } from "next/server";

type IncomingItem = {
  id: string;
  deleted?: boolean;
};

export async function POST(request: Request) {
  const body = (await request.json()) as {
    notes?: IncomingItem[];
    lists?: IncomingItem[];
  };
  const now = new Date().toISOString();
  const notes = Array.isArray(body.notes) ? body.notes : [];
  const lists = Array.isArray(body.lists) ? body.lists : [];

  return NextResponse.json({
    syncedAt: now,
    notes: notes.map((note) => ({
      ...note,
      syncStatus: "synced",
      serverVersion: now
    })),
    lists: lists.map((list) => ({
      ...list,
      syncStatus: "synced",
      serverVersion: now
    }))
  });
}