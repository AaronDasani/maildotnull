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
  setRead(id: string, read: boolean): boolean;
  markAllRead(): void;
  remove(id: string): boolean;
  clear(): void;
}

/** Visible text only: drop style/script/head blocks and comments before stripping tags. */
function snippetSource(email: StoredEmail): string {
  if (email.text?.trim()) return email.text;
  if (!email.html) return "";
  return email.html
    .replace(/<(style|script|head|title)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"');
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
        snippet: snippetSource(e).replace(/\s+/g, " ").trim().slice(0, 140),
      }));
    },
    get(id) {
      return emails.find((e) => e.id === id);
    },
    setRead(id, read) {
      const email = emails.find((e) => e.id === id);
      if (!email) return false;
      if (email.read !== read) {
        email.read = read;
        emitter.emit("change");
      }
      return true;
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
  // Recreate (dropping messages) if an HMR-surviving instance predates newer store methods.
  if (typeof globalStore.__mailburliStore?.setRead !== "function") {
    globalStore.__mailburliStore = createStore();
  }
  return globalStore.__mailburliStore;
}
