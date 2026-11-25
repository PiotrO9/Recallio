import styles from "./card-art.module.css";

export function CardArt() {
  return (
    <div className={styles.scene} aria-hidden="true">
      <div className={styles.stack}>
        <i className={styles.back} />
        <i className={styles.middle} />
        <div className={styles.face}>
          <span className={styles.tabs} />
          <span className={styles.eyes} />
          <span className={styles.smile} />
        </div>
      </div>
    </div>
  );
}
