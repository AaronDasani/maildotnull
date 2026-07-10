import { SMTPServer } from "smtp-server";
import { simpleParser, type AddressObject } from "mailparser";
import { getStore } from "./store";
import type { StoredAttachment } from "./types";

const SMTP_PORT = Number(process.env.MAILBURLI_SMTP_PORT ?? 1025);

function addressList(value?: AddressObject | AddressObject[]): string[] {
  const objects = value ? (Array.isArray(value) ? value : [value]) : [];
  return objects.flatMap((obj) =>
    obj.value.map((a) => (a.name ? `${a.name} <${a.address}>` : (a.address ?? "")))
  );
}

export function startSmtpServer(): void {
  const server = new SMTPServer({
    authOptional: true,
    // Advertise AUTH on the plaintext connection so clients configured with
    // user/password (like Mailpit setups) can log in without TLS.
    allowInsecureAuth: true,
    disabledCommands: ["STARTTLS"],
    // Accept any credentials — this is a local mock.
    onAuth(_auth, _session, callback) {
      callback(null, { user: "mailburli" });
    },
    onData(stream, _session, callback) {
      // Buffer the message so the raw MIME can be stored alongside the parsed form.
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.once("end", () => {
        const raw = Buffer.concat(chunks);
        simpleParser(raw)
          .then((parsed) => {
            const attachments: StoredAttachment[] = parsed.attachments.map((a) => ({
              filename: a.filename ?? "attachment",
              contentType: a.contentType,
              size: a.size,
              content: a.content.toString("base64"),
            }));
            const headers: Record<string, string> = {};
            for (const [key, value] of parsed.headers) {
              headers[key] = typeof value === "string" ? value : JSON.stringify(value);
            }
            getStore().add({
              source: "smtp",
              from: addressList(parsed.from)[0] ?? "",
              to: addressList(parsed.to),
              cc: addressList(parsed.cc),
              bcc: addressList(parsed.bcc),
              replyTo: addressList(parsed.replyTo)[0],
              subject: parsed.subject ?? "",
              text: parsed.text ?? undefined,
              html: parsed.html || undefined,
              headers,
              attachments,
              raw: raw.toString("utf8"),
            });
            callback();
          })
          .catch((err: Error) => callback(err));
      });
    },
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `\n[mailburli] ⚠️  SMTP port ${SMTP_PORT} is already in use — incoming SMTP mail will NOT be captured by this instance!\n` +
          `[mailburli]     Another mailburli/mailpit instance is probably still running. Find it with:\n` +
          `[mailburli]     ss -tlnp | grep :${SMTP_PORT}\n`
      );
      return;
    }
    console.error("[mailburli] SMTP server error:", err.message);
  });

  server.listen(SMTP_PORT, () => {
    console.log(`[mailburli] SMTP server listening on port ${SMTP_PORT} (all interfaces)`);
  });
}
