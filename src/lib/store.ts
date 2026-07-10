import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { EmailSummary, StoredEmail } from "./types";

// Oldest messages are dropped beyond this cap; raise it if you need longer sessions.
const MAX_MESSAGES = 1000;

export interface MailStore {
  emitter: EventEmitter;
  add(email: Omit<StoredEmail, "id" | "receivedAt" | "read">): StoredEmail;
  list(): EmailSummary[];
  get(id: string): StoredEmail | undefined;
  markRead(id: string): void;
  markAllRead(): void;
  remove(id: string): boolean;
  clear(): void;
}

function createStore(): MailStore {
  const emails: StoredEmail[] = [];
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);

  return {
    emitter,
    add(input) {
      const email: StoredEmail = {
        ...input,
        id: randomUUID(),
        receivedAt: new Date().toISOString(),
        read: false,
      };
      emails.unshift(email);
      if (emails.length > MAX_MESSAGES) emails.length = MAX_MESSAGES;
      emitter.emit("change");
      return email;
    },
    list() {
      return emails.map((e) => ({
        id: e.id,
        source: e.source,
        from: e.from,
        to: e.to,
        subject: e.subject,
        receivedAt: e.receivedAt,
        read: e.read,
        hasAttachments: e.attachments.length > 0,
        snippet: (e.text ?? e.html?.replace(/<[^>]*>/g, " ") ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 140),
      }));
    },
    get(id) {
      return emails.find((e) => e.id === id);
    },
    markRead(id) {
      const email = emails.find((e) => e.id === id);
      if (email && !email.read) {
        email.read = true;
        emitter.emit("change");
      }
    },
    markAllRead() {
      let changed = false;
      for (const email of emails) {
        if (!email.read) {
          email.read = true;
          changed = true;
        }
      }
      if (changed) emitter.emit("change");
    },
    remove(id) {
      const idx = emails.findIndex((e) => e.id === id);
      if (idx === -1) return false;
      emails.splice(idx, 1);
      emitter.emit("change");
      return true;
    },
    clear() {
      emails.length = 0;
      emitter.emit("change");
    },
  };
}

// Survives Next.js dev-mode HMR module reloads.
const globalStore = globalThis as unknown as { __mailburliStore?: MailStore };

export function getStore(): MailStore {
  globalStore.__mailburliStore ??= createStore();
  return globalStore.__mailburliStore;
}
