import { SMTPServer, type SMTPServerOptions } from "smtp-server";
import { simpleParser, type AddressObject } from "mailparser";
import { generate } from "selfsigned";
import { getStore } from "./store";
import { getErrorTesting } from "./error-testing";
import { headersFromParsed } from "./ingest";
import type { StoredAttachment } from "./types";

const SMTP_PORT = Number(process.env.MAILDOTNULL_SMTP_PORT ?? 1025);
const SMTPS_PORT = Number(process.env.MAILDOTNULL_SMTPS_PORT ?? 1465);
const STARTTLS_PORT = Number(process.env.MAILDOTNULL_STARTTLS_PORT ?? 1587);

function addressList(value?: AddressObject | AddressObject[]): string[] {
  const objects = value ? (Array.isArray(value) ? value : [value]) : [];
  return objects.flatMap((obj) =>
    obj.value.map((a) => (a.name ? `${a.name} <${a.address}>` : (a.address ?? "")))
  );
}

function smtpError(code: number, message: string): Error {
  const err = new Error(message) as Error & { responseCode: number };
  err.responseCode = code;
  return err;
}

function serverOptions(tls: { key: string; cert: string }): SMTPServerOptions {
  return {
    authOptional: true,
    // Advertise AUTH on the plaintext connection so clients configured with
    // user/password (like Mailpit setups) can log in without TLS.
    allowInsecureAuth: true,
    // Self-signed cert for STARTTLS (port 1587) and implicit TLS (port 1465).
    key: tls.key,
    cert: tls.cert,
    // Accept any credentials — this is a local mock.
    onAuth(_auth, _session, callback) {
      callback(null, { user: "maildotnull" });
    },
    onMailFrom(_address, session, callback) {
      const state = getErrorTesting();
      if (state.smtp === "reject-temporary") {
        return callback(smtpError(451, "Requested action aborted: simulated temporary failure (MailDotNull)"));
      }
      if (state.smtp === "reject-permanent") {
        return callback(smtpError(550, "Requested action not taken: simulated permanent failure (MailDotNull)"));
      }
      if (state.smtpAuth === "required" && !session.user) {
        return callback(smtpError(530, "Authentication required"));
      }
      if (state.smtp === "delay") {
        return void setTimeout(callback, state.delaySeconds * 1000);
      }
      if (state.smtp === "timeout") {
        // Stall until the client's own timeout fires; 421 as a backstop.
        return void setTimeout(
          () => callback(smtpError(421, "Timeout (simulated by MailDotNull), closing connection")),
          5 * 60 * 1000
        );
      }
      callback();
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
              headers: headersFromParsed(parsed),
              attachments,
              raw: raw.toString("utf8"),
            });
            callback();
          })
          .catch((err: Error) => callback(err));
      });
    },
  };
}

function listen(server: SMTPServer, port: number, label: string): void {
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `\n[maildotnull] ⚠️  ${label} port ${port} is already in use — incoming mail on it will NOT be captured by this instance!\n` +
          `[maildotnull]     Another maildotnull/mailpit instance is probably still running. Find it with:\n` +
          `[maildotnull]     ss -tlnp | grep :${port}\n`
      );
      return;
    }
    console.error(`[maildotnull] ${label} server error:`, err.message);
  });

  server.listen(port, () => {
    console.log(`[maildotnull] ${label} server listening on port ${port} (all interfaces)`);
  });
}

export async function startSmtpServer(): Promise<void> {
  // Ephemeral in-memory self-signed cert — clients must accept it (local testing only).
  const pems = await generate([{ name: "commonName", value: "localhost" }], {
    algorithm: "sha256",
  });
  const tls = { key: pems.private, cert: pems.cert };

  // Port 1025: plaintext only. STARTTLS must NOT be advertised here — clients like
  // nodemailer upgrade opportunistically and then reject the self-signed cert,
  // breaking every existing "host: localhost, port: 1025" setup.
  listen(
    new SMTPServer({ ...serverOptions(tls), disabledCommands: ["STARTTLS"] }),
    SMTP_PORT,
    "SMTP"
  );
  // Port 1587: STARTTLS. Port 1465: implicit TLS.
  listen(new SMTPServer(serverOptions(tls)), STARTTLS_PORT, "SMTP-STARTTLS");
  listen(new SMTPServer({ ...serverOptions(tls), secure: true }), SMTPS_PORT, "SMTPS");
}
