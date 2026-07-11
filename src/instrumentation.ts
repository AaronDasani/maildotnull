export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const started = globalThis as unknown as { __maildotnullSmtpStarted?: boolean };
    if (!started.__maildotnullSmtpStarted) {
      started.__maildotnullSmtpStarted = true;
      const { startSmtpServer } = await import("./lib/smtp");
      await startSmtpServer();
    }
  }
}
