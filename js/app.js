/* ================================
   MODAL SYSTEM - UBER STYLE
   ================================ */

/* Estado cerrado - NO interferir con el mapa */
.incoming-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: none;
  /* Importante: no usar pointer-events: none aquí */
}

/* Estado abierto */
.incoming-modal.active {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 20px;
  padding-bottom: calc(20px + env(safe-area-inset-bottom));
}

/* Backdrop oscuro */
.incoming-modal.active .modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(4px);
  animation: fadeIn 0.2s ease;
}

/* Contenido del modal */
.modal-content {
  position: relative;
  z-index: 1001;
  background: var(--color-bg-elevated);
  border-radius: 24px;
  padding: 24px;
  width: 100%;
  max-width: 420px;
  max-height: 85vh;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  box-shadow: 0 -4px 30px rgba(0,0,0,0.5);
  animation: slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  
  /* Asegurar que esté por encima y capture clicks */
  pointer-events: auto;
  transform: translateZ(0);
}

/* Botones - Z-index superior */
.modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
  position: relative;
  z-index: 1002;
}

.btn-accept,
.btn-reject {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 16px;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 700;
  transition: transform 0.1s;
  position: relative;
  z-index: 1003;
  pointer-events: auto;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.btn-accept {
  background: var(--color-success);
  color: white;
  flex: 1.5;
}

.btn-reject {
  background: var(--color-bg-card);
  color: var(--color-text-primary);
}

.btn-accept:active,
.btn-reject:active {
  transform: scale(0.96);
}

/* Asegurar que el mapa funcione siempre */
#map-container {
  position: fixed;
  inset: 0;
  z-index: 0;
}

/* Prevenir scroll del body cuando modal abierto */
body.modal-open {
  overflow: hidden;
}
