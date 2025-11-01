import React, { useMemo } from "react";
import styles from "./perfil.module.css";
import Navbar from "../components/Navbar";
import { useAuth } from "../auth/AuthContext";

function formatDate(d?: string | null) {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    return dt.toLocaleString("es-GT", { hour12: false });
  } catch {
    return d ?? "—";
  }
}

function getInitials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export default function Perfil() {
  const { user, loading, login, logout } = useAuth();

  const providers = useMemo(() => {
    if (!user?.providerData?.length) return ["—"];
    return user.providerData.map((p) => p?.providerId ?? "—");
  }, [user]);

  if (loading) {
    return (
      <>
        <Navbar />
        <div className={styles.page}>
          <div className={`${styles.card} ${styles.fadeIn}`}>
            <div className={styles.skeletonHeader}>
              <div className={styles.skeletonAvatar} />
              <div className={styles.skeletonLines}>
                <div className={styles.skeletonLine} />
                <div className={styles.skeletonLineShort} />
              </div>
            </div>
            <div className={styles.grid}>
              {[...Array(6)].map((_, i) => (
                <div key={i} className={styles.skeletonBlock} />
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <Navbar />
        <div className={styles.page}>
          <div className={`${styles.cardEmpty} ${styles.fadeIn}`}>
            <h1 className={styles.title}>Tu perfil</h1>
            <p className={styles.subtitle}>
              Inicia sesión para ver tu información de perfil.
            </p>
            <button className={`${styles.primaryBtn} ${styles.btnFull}`} onClick={login}>
              Iniciar sesión con Google
            </button>
          </div>
        </div>
      </>
    );
  }

  const photo = user.photoURL || "";
  const displayName = user.displayName || "Usuario";
  const initials = getInitials(displayName);

  return (
    <>
      <Navbar />
      <div className={styles.page}>
        <div className={`${styles.card} ${styles.fadeIn}`}>
          {/* Header */}
          <header className={styles.header}>
            <div className={styles.avatarWrap}>
              {photo ? (
                <img
                  src={photo}
                  alt={displayName}
                  referrerPolicy="no-referrer"
                  className={styles.avatar}
                />
              ) : (
                <div className={styles.avatarFallback}>{initials}</div>
              )}
              {user.emailVerified && (
                <span className={styles.badge}>Verificado</span>
              )}
            </div>

            <div className={styles.headerInfo}>
              <h1 className={styles.title}>{displayName}</h1>
              <p className={styles.subtitle}>{user.email ?? "—"}</p>

              <div className={styles.headerActions}>
                <a
                  className={`${styles.linkBtn} ${styles.btnFullSm}`}
                  href="https://myaccount.google.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Gestionar cuenta de Google
                </a>
                <button
                  className={`${styles.ghostBtn} ${styles.btnFullSm}`}
                  onClick={logout}
                >
                  Cerrar sesión
                </button>
              </div>
            </div>
          </header>

          {/* Body */}
          <section className={styles.grid}>
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>Información básica</h2>
              <div className={styles.item}>
                <span className={styles.label}>Nombre</span>
                <span className={styles.value}>{displayName}</span>
              </div>
              <div className={styles.item}>
                <span className={styles.label}>Correo</span>
                <span className={styles.value}>{user.email ?? "—"}</span>
              </div>
              <div className={styles.item}>
                <span className={styles.label}>UID</span>
                <span className={styles.valueMono}>{user.uid}</span>
              </div>
            </div>

            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>Actividad</h2>
              <div className={styles.item}>
                <span className={styles.label}>Último acceso</span>
                <span className={styles.value}>
                  {formatDate(user.metadata?.lastSignInTime)}
                </span>
              </div>
              <div className={styles.item}>
                <span className={styles.label}>Cuenta creada</span>
                <span className={styles.value}>
                  {formatDate(user.metadata?.creationTime)}
                </span>
              </div>
              <div className={styles.item}>
                <span className={styles.label}>Proveedores</span>
                <span className={styles.value}>{providers.join(", ")}</span>
              </div>
            </div>

            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>Seguridad</h2>
              <div className={styles.item}>
                <span className={styles.label}>Email verificado</span>
                <span className={styles.value}>
                  {user.emailVerified ? "Sí" : "No"}
                </span>
              </div>
              <div className={styles.item}>
                <span className={styles.label}>2FA de Google</span>
                <span className={styles.value}>
                  Gestiona 2FA desde tu cuenta de Google
                </span>
              </div>
              <div className={styles.tip}>
                Para cambiar contraseña o métodos de acceso, usa{" "}
                <a
                  className={styles.inlineLink}
                  href="https://myaccount.google.com/security"
                  target="_blank"
                  rel="noreferrer"
                >
                  la seguridad de tu cuenta de Google
                </a>.
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}