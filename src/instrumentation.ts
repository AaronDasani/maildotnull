export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const started = globalThis as unknown as { __mailburliSmtpStarted?: boolean };
    if (!started.__mailburliSmtpStarted) {
      started.__mailburliSmtpStarted = true;
      const { startSmtpServer } = await import("./lib/smtp");
      startSmtpServer();
    }
  }
}
