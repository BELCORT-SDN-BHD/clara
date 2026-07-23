// /onboarding — a hub for the Wave-B onboarding surfaces (settled dashboard plan F8). Firm
// bootstrap is for a pre-firm principal; client onboarding drives the durable identity interview.

import Link from "next/link";
import styles from "./onboarding.module.css";

export default function OnboardingHub() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Onboarding</h1>
      <p className={styles.subtitle}>Firm bootstrap</p>
      <p className={styles.muted}>Register a new firm (for a user who does not yet belong to one). Clara interviews you, then creates the firm.</p>
      <p><Link className={styles.linkButton} href="/onboarding/firm">Start firm bootstrap →</Link></p>

      <p className={styles.subtitle}>Client onboarding</p>
      <p className={styles.muted}>Begin or resume a client identity interview, then commit onboarding from the client&rsquo;s plan.</p>
      <p><Link className={styles.linkButton} href="/onboarding/client">Onboard a client →</Link></p>
    </main>
  );
}
