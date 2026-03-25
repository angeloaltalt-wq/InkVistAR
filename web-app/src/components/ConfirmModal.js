import React from 'react';
import { TriangleAlert, Trash2 } from 'lucide-react';
import '../pages/PortalStyles.css'; // Leverage existing glassmorphism classes

const ConfirmModal = ({ isOpen, title, message, confirmText, cancelText, onConfirm, onCancel, type = "danger" }) => {
    if (!isOpen) return null;

    const isDanger = type === "danger";

    return (
        <div className="modal-overlay open" onClick={onCancel}>
            <div className="modal-content" style={{ maxWidth: '450px', padding: '0', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: '24px', textAlign: 'center' }}>
                    <div style={{ 
                        width: '64px', height: '64px', borderRadius: '50%', 
                        background: isDanger ? '#fee2e2' : '#e0e7ff', 
                        display: 'flex', alignItems: 'center', justifyContent: 'center', 
                        margin: '0 auto 16px', color: isDanger ? '#dc2626' : '#4f46e5' 
                    }}>
                        {isDanger ? <Trash2 size={32} /> : <TriangleAlert size={32} />}
                    </div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: '0 0 8px', color: '#1f2937' }}>{title || "Confirm Action"}</h2>
                    <p style={{ fontSize: '0.95rem', color: '#6b7280', margin: '0' }}>{message}</p>
                </div>
                <div style={{ display: 'flex', borderTop: '1px solid #e5e7eb', background: '#f9fafb' }}>
                    <button 
                        onClick={onCancel} 
                        style={{ flex: 1, padding: '16px', background: 'transparent', border: 'none', borderRight: '1px solid #e5e7eb', fontWeight: 600, color: '#6b7280', cursor: 'pointer' }}
                    >
                        {cancelText || "Cancel"}
                    </button>
                    <button 
                        onClick={onConfirm} 
                        style={{ flex: 1, padding: '16px', background: 'transparent', border: 'none', fontWeight: 600, color: isDanger ? '#dc2626' : '#4f46e5', cursor: 'pointer' }}
                    >
                        {confirmText || "Confirm"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;
